const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// ==========================================
// 🟢 1. Middleware Setup
// ==========================================
app.use(cors());
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ==========================================
// 🟢 2. MongoDB Cloud Connection (WITH FIREBASE MAGIC)
// ==========================================
mongoose.connect('mongodb+srv://robiul926sk_db_user:X35cF8uk3qXGabH8@cluster0.axgj0zh.mongodb.net/greenland_school_db?appName=Cluster0')
  .then(() => {
    console.log("✅ MongoDB Cloud Connected Successfully!");

    // 🟢 ফায়ারবেসের মতো ম্যাজিক: ডাটাবেস ড্যাশবোর্ড থেকে কিছু চেঞ্জ করলে সরাসরি অ্যাপে সিগন্যাল যাবে
    School.watch([], { fullDocument: 'updateLookup' }).on('change', (change) => {
      if (change.fullDocument && change.fullDocument.uid) {
        io.to(change.fullDocument.uid).emit('data_updated', { type: 'school_data' });
      }
    });
  })
  .catch((err) => console.log("❌ DB Connection Error:", err));

// ==========================================
// 🟢 3. Socket.io Setup (For Real-time Sync)
// ==========================================
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

io.on('connection', (socket) => {
  console.log('🔵 New User Connected to Socket:', socket.id);
  
  socket.on('join_room', (roomId) => { 
    socket.join(roomId); 
    console.log(`User joined room: ${roomId}`);
  });

  socket.on('join_school_room', (schoolId) => { 
    socket.join(schoolId); 
    console.log(`User joined school room for live sync: ${schoolId}`);
  });

  socket.on('send_message', (data) => { 
    io.to(data.roomId).emit('receive_message', data); 
  });

  socket.on('disconnect', () => { 
    console.log('🔴 User Disconnected:', socket.id); 
  });
});

// ==========================================
// 🟢 4. Security & Encryption (Govt IDs)
// ==========================================
const ENCRYPTION_KEY = crypto.randomBytes(32); 
const IV_LENGTH = 16;

function encryptData(text) {
  if (!text) return text;
  if (text.includes(':') && text.length > 32) return text; 
  
  let iv = crypto.randomBytes(IV_LENGTH);
  let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptData(text) {
  if (!text || !text.includes(':')) return text;
  try {
    let textParts = text.split(':');
    let iv = Buffer.from(textParts.shift(), 'hex');
    let encryptedText = Buffer.from(textParts.join(':'), 'hex');
    let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    return text; 
  }
}

// ==========================================
// 🟢 5. Models 
// ==========================================
const schoolSchema = new mongoose.Schema({ uid: String }, { strict: false });
const School = mongoose.model('School', schoolSchema);

const studentSchema = new mongoose.Schema({ schoolId: String, docId: String }, { strict: false });
const Student = mongoose.model('Student', studentSchema, 'students');

const teacherSchema = new mongoose.Schema({ schoolId: String, docId: String }, { strict: false });
const Teacher = mongoose.model('Teacher', teacherSchema, 'teachers');


// ==========================================
// 🟢 6. ADMIN & USER CHECKING
// ==========================================

app.get('/api/users', async (req, res) => {
  try {
    const users = await School.find(req.query);
    res.status(200).json(users); 
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/users/:uid', async (req, res) => {
  try {
    let school = await School.findOne({ uid: req.params.uid });
    if (school) {
      res.status(200).json(school); 
    } else {
      res.status(404).json({ message: "User not found" }); 
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 🔹 School Data Update (With CUSTOM END DATE Logic)
app.put('/api/users/:uid', async (req, res) => {
  try {
    let updateData = { ...req.body };
    
    // 🟢 ম্যাজিক ফিক্স: যদি ১০০ দিনের কাস্টম ডেট বা ম্যানুয়াল ডেট পাঠানো হয়
    if (updateData.end_date) {
      updateData.end_date = Number(updateData.end_date);
    } 
    // নতুবা যদি শুধু প্ল্যানের নাম পাঠানো হয়, তখন অটোমেটিক ক্যালকুলেট করবে
    else if (updateData.currentPlan) {
      let planName = updateData.currentPlan.toLowerCase();
      let addedDays = 30; 
      if (planName.includes("7 days") || planName.includes("week") || planName.includes("49")) addedDays = 7;
      if (planName.includes("3 months")) addedDays = 90;
      if (planName.includes("1 year") || planName.includes("1499")) addedDays = 365;
      updateData.end_date = Date.now() + (addedDays * 24 * 60 * 60 * 1000);
    }

    const updated = await School.findOneAndUpdate(
      { uid: req.params.uid }, 
      { $set: updateData }, 
      { new: true, upsert: true } 
    );
    
    io.to(req.params.uid).emit('data_updated', { type: 'school_data' });
    res.json({ success: true, data: updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/users/:uid', async (req, res) => {
  try {
    let updateData = { ...req.body };
    
    // 🟢 ম্যাজিক ফিক্স: ম্যানুয়াল ডেট প্রায়োরিটি পাবে
    if (updateData.end_date) {
      updateData.end_date = Number(updateData.end_date);
    } else if (updateData.currentPlan) {
      let planName = updateData.currentPlan.toLowerCase();
      let addedDays = 30; 
      if (planName.includes("7 days") || planName.includes("week") || planName.includes("49")) addedDays = 7;
      if (planName.includes("3 months")) addedDays = 90;
      if (planName.includes("1 year") || planName.includes("1499")) addedDays = 365;
      updateData.end_date = Date.now() + (addedDays * 24 * 60 * 60 * 1000);
    }

    const updated = await School.findOneAndUpdate({ uid: req.params.uid }, { $set: updateData }, { new: true, upsert: true });
    io.to(req.params.uid).emit('data_updated', { type: 'school_data' });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ==========================================
// 🟢 7. MASTER LOGIN API 
// ==========================================
app.post('/api/login', async (req, res) => {
  try {
    const { role, schoolId, userId, password } = req.body;

    if (role === "admin") {
      const school = await School.findOne({ uid: userId });
      if (!school) return res.status(404).json({ error: "Admin ID not found!" });
      if (password !== school.password) return res.status(400).json({ error: "Invalid Password!" });
      return res.json({ success: true, data: school });
    }

    if (role === "student") {
      const allStudents = await Student.find({ schoolId: schoolId });
      
      const student = allStudents.find(s => {
        if (!s.name || !s.roll) return false;
        let namePart = s.name.length >= 3 ? s.name.substring(0, 3).toLowerCase() : s.name.toLowerCase();
        let generatedId = namePart + s.roll.toLowerCase();
        return generatedId === userId.toLowerCase();
      });

      if (!student) return res.status(404).json({ error: "Student ID not found! Check Name and Roll." });
      if (student.loginEnabled === false) return res.status(403).json({ error: "Login disabled by Admin." });
      if (password !== student.password) return res.status(400).json({ error: "Invalid Password!" });
      
      if (student.govIdNumber) student.govIdNumber = decryptData(student.govIdNumber);
      return res.json({ success: true, data: student });
    }

    if (role === "teacher") {
      const teacher = await Teacher.findOne({ schoolId: schoolId, docId: userId });
      if (!teacher) return res.status(404).json({ error: "Teacher not found!" });
      if (teacher.loginEnabled === false) return res.status(403).json({ error: "Login disabled by Admin." });
      if (password !== teacher.password) return res.status(400).json({ error: "Invalid Password!" });
      
      if (teacher.govIdNumber) teacher.govIdNumber = decryptData(teacher.govIdNumber);
      return res.json({ success: true, data: teacher });
    }
    res.status(400).json({ error: "Invalid Role!" });
  } catch (error) { res.status(500).json({ error: error.message }); }
});


// ==========================================
// 🟢 8. Dynamic Firebase-like Routing Engine
// ==========================================
const getDynamicModel = (collectionName) => {
  if (mongoose.models[collectionName]) return mongoose.models[collectionName];
  const schema = new mongoose.Schema({}, { strict: false, versionKey: false });
  return mongoose.model(collectionName, schema, collectionName);
};

app.get('/api/users/:uid/:collectionName', async (req, res) => {
  try {
    const Model = getDynamicModel(req.params.collectionName);
    const filter = { schoolId: req.params.uid, ...req.query }; 
    const data = await Model.find(filter);
    
    const formattedData = data.map(d => {
      let obj = { id: d.docId || d._id.toString(), ...d._doc };
      if (obj.govIdNumber) obj.govIdNumber = decryptData(obj.govIdNumber);
      if (obj.aadhaar) obj.aadhaar = decryptData(obj.aadhaar);
      return obj;
    });

    res.json(formattedData);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users/:uid/:collectionName', async (req, res) => {
  try {
    const Model = getDynamicModel(req.params.collectionName);
    let dataToSave = { ...req.body, schoolId: req.params.uid };
    
    if (dataToSave.govIdNumber) dataToSave.govIdNumber = encryptData(dataToSave.govIdNumber);
    if (dataToSave.aadhaar) dataToSave.aadhaar = encryptData(dataToSave.aadhaar);
    
    const newDoc = new Model(dataToSave);
    await newDoc.save();
    
    io.to(req.params.uid).emit('data_updated', { type: req.params.collectionName });
    res.status(201).json({ success: true, id: newDoc._id.toString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.route('/api/users/:uid/:collectionName/:docId')
  .get(async (req, res) => {
    try {
      const Model = getDynamicModel(req.params.collectionName);
      const data = await Model.findOne({ schoolId: req.params.uid, docId: req.params.docId });
      if (data) {
        let obj = { id: data.docId || data._id.toString(), ...data._doc };
        if (obj.govIdNumber) obj.govIdNumber = decryptData(obj.govIdNumber);
        if (obj.aadhaar) obj.aadhaar = decryptData(obj.aadhaar);
        res.json(obj);
      }
      else res.status(404).json({ error: "Not Found" });
    } catch (err) { res.status(500).json({ error: err.message }); }
  })
  .put(async (req, res) => {
    try {
      const Model = getDynamicModel(req.params.collectionName);
      let updateData = { ...req.body, schoolId: req.params.uid, docId: req.params.docId };
      
      if (updateData.govIdNumber) updateData.govIdNumber = encryptData(updateData.govIdNumber);
      if (updateData.aadhaar) updateData.aadhaar = encryptData(updateData.aadhaar);

      const updated = await Model.findOneAndUpdate(
        { schoolId: req.params.uid, docId: req.params.docId }, 
        updateData, 
        { new: true, upsert: true }
      );
      
      io.to(req.params.uid).emit('data_updated', { type: req.params.collectionName });
      res.json(updated);
    } catch (err) { res.status(500).json({ error: err.message }); }
  })
  .patch(async (req, res) => {
    try {
      const Model = getDynamicModel(req.params.collectionName);
      let updateQuery = { $set: {} };
      let unsetQuery = { $unset: {} };
      
      for (let key in req.body) {
        if (req.body[key] === null) unsetQuery.$unset[key] = "";
        else {
          if (key === 'govIdNumber' || key === 'aadhaar') {
            updateQuery.$set[key] = encryptData(req.body[key]);
          } else {
            updateQuery.$set[key] = req.body[key];
          }
        }
      }

      let finalUpdate = {};
      if (Object.keys(updateQuery.$set).length > 0) finalUpdate = { ...finalUpdate, ...updateQuery };
      if (Object.keys(unsetQuery.$unset).length > 0) finalUpdate = { ...finalUpdate, ...unsetQuery };

      const updated = await Model.findOneAndUpdate(
        { schoolId: req.params.uid, docId: req.params.docId }, 
        finalUpdate, 
        { new: true, upsert: true }
      );
      
      io.to(req.params.uid).emit('data_updated', { type: req.params.collectionName });
      res.json(updated || {});
    } catch (err) { res.status(500).json({ error: err.message }); }
  })
  .delete(async (req, res) => {
    try {
      const Model = getDynamicModel(req.params.collectionName);
      let query = req.params.docId.length === 24 ? { _id: req.params.docId } : { schoolId: req.params.uid, docId: req.params.docId };
      await Model.findOneAndDelete(query);
      
      io.to(req.params.uid).emit('data_updated', { type: req.params.collectionName });
      res.json({ success: true, message: "Deleted Successfully" });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

// ==========================================
// 🟢 9. Active Rooms (Live Exam & WebRTC)
// ==========================================
const ActiveRoom = getDynamicModel('active_rooms');

app.post('/api/active_rooms', async (req, res) => {
  try {
    const newRoom = new ActiveRoom({ ...req.body, docId: req.body.roomId });
    await newRoom.save();
    io.emit('room_updated', newRoom.docId); 
    res.status(201).json({ success: true, id: newRoom.docId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/active_rooms', async (req, res) => {
  try {
    const rooms = await ActiveRoom.find(req.query);
    res.json(rooms.map(r => ({ id: r.docId, ...r._doc })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/active_rooms/:roomId', async (req, res) => {
  try {
    const room = await ActiveRoom.findOne({ docId: req.params.roomId });
    if(room) res.json(room); else res.status(404).json({ error: "Room not found" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/active_rooms/:roomId', async (req, res) => {
  try {
    const updated = await ActiveRoom.findOneAndUpdate({ docId: req.params.roomId }, { $set: req.body }, { new: true, upsert: true });
    io.emit('room_updated', req.params.roomId);
    res.json(updated || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/active_rooms/:roomId', async (req, res) => {
  try {
    await ActiveRoom.findOneAndDelete({ docId: req.params.roomId });
    io.emit('room_updated', req.params.roomId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Room Sub-collections ---
app.get('/api/active_rooms/:roomId/:subCollection', async (req, res) => {
  try {
    const Model = getDynamicModel(`room_${req.params.roomId}_${req.params.subCollection}`);
    const data = await Model.find(req.query);
    res.json(data.map(d => ({ id: d.docId || d._id.toString(), ...d._doc })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/active_rooms/:roomId/:subCollection/:subDocId', async (req, res) => {
  try {
    const Model = getDynamicModel(`room_${req.params.roomId}_${req.params.subCollection}`);
    const data = await Model.findOne({ docId: req.params.subDocId });
    res.json(data || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/active_rooms/:roomId/:subCollection', async (req, res) => {
  try {
    const Model = getDynamicModel(`room_${req.params.roomId}_${req.params.subCollection}`);
    const newDoc = new Model({ ...req.body, docId: req.body.id || req.body.roomId });
    await newDoc.save();
    io.emit('room_sub_updated', req.params.roomId);
    res.status(201).json({ success: true, id: newDoc._id.toString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/active_rooms/:roomId/:subCollection/:subDocId', async (req, res) => {
  try {
    const Model = getDynamicModel(`room_${req.params.roomId}_${req.params.subCollection}`);
    const updated = await Model.findOneAndUpdate({ docId: req.params.subDocId }, { ...req.body, docId: req.params.subDocId }, { new: true, upsert: true });
    io.emit('room_sub_updated', req.params.roomId);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/active_rooms/:roomId/:subCollection/:subDocId', async (req, res) => {
  try {
    const Model = getDynamicModel(`room_${req.params.roomId}_${req.params.subCollection}`);
    const updated = await Model.findOneAndUpdate({ docId: req.params.subDocId }, { $set: req.body }, { new: true, upsert: true });
    io.emit('room_sub_updated', req.params.roomId);
    res.json(updated || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/active_rooms/:roomId/:subCollection/:subDocId', async (req, res) => {
  try {
    const Model = getDynamicModel(`room_${req.params.roomId}_${req.params.subCollection}`);
    await Model.findOneAndDelete({ docId: req.params.subDocId });
    io.emit('room_sub_updated', req.params.roomId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ==========================================
// 🟢 Global Developer Feedbacks
// ==========================================
const Feedback = getDynamicModel('developer_feedbacks');
app.get('/api/developer_feedbacks', async (req, res) => {
  try {
    const feedbacks = await Feedback.find(req.query);
    res.json(feedbacks.map(f => ({ id: f._id.toString(), ...f._doc })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/developer_feedbacks', async (req, res) => {
  try {
    const f = new Feedback(req.body); await f.save(); res.json({ id: f._id.toString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.patch('/api/developer_feedbacks/:id', async (req, res) => {
  try {
    const updated = await Feedback.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true }); res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/developer_feedbacks/:id', async (req, res) => {
  try { await Feedback.findByIdAndDelete(req.params.id); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 🟢 Server Start
// ==========================================
const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Master Backend Server is running on Port: ${PORT}`);
});