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
app.use(express.json({ limit: '50mb' })); // বড় ছবি বা ফাইল রিসিভ করার জন্য
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ==========================================
// 🟢 2. MongoDB Cloud Connection
// ==========================================
mongoose.connect('mongodb+srv://robiul926sk_db_user:X35cF8uk3qXGabH8@cluster0.axgj0zh.mongodb.net/greenland_school_db?appName=Cluster0')
  .then(() => console.log("✅ MongoDB Cloud Connected Successfully!"))
  .catch((err) => console.log("❌ DB Connection Error:", err));

// ==========================================
// 🟢 3. Socket.io Setup (For Live Calls & WebRTC)
// ==========================================
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

io.on('connection', (socket) => {
  console.log('🔵 New User Connected to Socket:', socket.id);
  socket.on('join_room', (roomId) => { socket.join(roomId); });
  socket.on('send_message', (data) => { io.to(data.roomId).emit('receive_message', data); });
  socket.on('disconnect', () => { console.log('🔴 User Disconnected:', socket.id); });
});

// ==========================================
// 🟢 4. Security & Encryption
// ==========================================
const ENCRYPTION_KEY = crypto.randomBytes(32); 
const IV_LENGTH = 16;

function encryptData(text) {
  if (!text) return text;
  let iv = crypto.randomBytes(IV_LENGTH);
  let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

// ==========================================
// 🟢 5. Auth & Login Routes (Specific)
// ==========================================
const schoolSchema = new mongoose.Schema({ uid: String, schoolName: String, password: String }, { strict: false });
const School = mongoose.model('School', schoolSchema);

const studentSchema = new mongoose.Schema({ schoolId: String, docId: String, password: String, loginEnabled: Boolean }, { strict: false });
const Student = mongoose.model('Student', studentSchema, 'students');

const teacherSchema = new mongoose.Schema({ schoolId: String, docId: String, password: String, loginEnabled: Boolean }, { strict: false });
const Teacher = mongoose.model('Teacher', teacherSchema, 'teachers');

app.post('/api/login', async (req, res) => {
  try {
    const { role, schoolId, userId, password } = req.body;

    if (role === "admin") {
      const school = await School.findOne({ uid: userId });
      if (!school) return res.status(404).json({ error: "Admin ID not found!" });
      const isMatch = await bcrypt.compare(password, school.password);
      if (!isMatch) return res.status(400).json({ error: "Invalid Password!" });
      return res.json({ success: true, data: school });
    }

    if (role === "student") {
      const student = await Student.findOne({ schoolId: schoolId, docId: `student_${userId}` });
      if (!student) return res.status(404).json({ error: "Student not found!" });
      if (student.loginEnabled === false) return res.status(403).json({ error: "Login disabled by Admin." });
      // Demo validation without bcrypt for quick test, you can add bcrypt later
      if (password !== student.password && !(await bcrypt.compare(password, student.password))) return res.status(400).json({ error: "Invalid Password!" });
      return res.json({ success: true, data: student });
    }

    if (role === "teacher") {
      const teacher = await Teacher.findOne({ schoolId: schoolId, docId: userId });
      if (!teacher) return res.status(404).json({ error: "Teacher not found!" });
      if (teacher.loginEnabled === false) return res.status(403).json({ error: "Login disabled by Admin." });
      if (password !== teacher.password && !(await bcrypt.compare(password, teacher.password))) return res.status(400).json({ error: "Invalid Password!" });
      return res.json({ success: true, data: teacher });
    }
    res.status(400).json({ error: "Invalid Role!" });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ==========================================
// 🟢 6. Dynamic Firebase-like Routing Engine (The Magic)
// ==========================================
// এই লজিকটি ফ্লাটার থেকে আসা যেকোনো কালেকশন (students, teachers, homework, doubts) অটোমেটিক সেভ করবে!

const getDynamicModel = (collectionName) => {
  if (mongoose.models[collectionName]) return mongoose.models[collectionName];
  const schema = new mongoose.Schema({}, { strict: false, versionKey: false });
  return mongoose.model(collectionName, schema, collectionName);
};

// 🔹 Get specific school admin details
app.get('/api/users/:uid', async (req, res) => {
  try {
    let data = await School.findOne({ uid: req.params.uid });
    if (!data) data = { uid: req.params.uid, currentPlan: "7 Days Ads Plan" };
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/users/:uid', async (req, res) => {
  try {
    const updated = await School.findOneAndUpdate({ uid: req.params.uid }, { $set: req.body }, { new: true, upsert: true });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 🔹 Get full list from a collection (e.g., all students, all doubts)
app.get('/api/users/:uid/:collectionName', async (req, res) => {
  try {
    const Model = getDynamicModel(req.params.collectionName);
    const filter = { schoolId: req.params.uid, ...req.query }; // Query filters (e.g., status='Pending') applied dynamically
    const data = await Model.find(filter);
    
    // Convert _id to id for Flutter
    const formattedData = data.map(d => ({ id: d._id.toString(), ...d._doc }));
    res.json(formattedData);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 🔹 Add new document to a collection
app.post('/api/users/:uid/:collectionName', async (req, res) => {
  try {
    const Model = getDynamicModel(req.params.collectionName);
    let dataToSave = { ...req.body, schoolId: req.params.uid };
    
    // Encrypt Gov ID if present
    if (dataToSave.govIdNumber) dataToSave.govIdNumber = encryptData(dataToSave.govIdNumber);
    
    const newDoc = new Model(dataToSave);
    await newDoc.save();
    res.status(201).json({ success: true, id: newDoc._id.toString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 🔹 Get, Put, Patch, Delete a specific document (e.g., student_123, app_data)
app.route('/api/users/:uid/:collectionName/:docId')
  .get(async (req, res) => {
    try {
      const Model = getDynamicModel(req.params.collectionName);
      const data = await Model.findOne({ schoolId: req.params.uid, docId: req.params.docId });
      if (data) res.json({ id: data._id.toString(), ...data._doc });
      else res.status(404).json({ error: "Not Found" });
    } catch (err) { res.status(500).json({ error: err.message }); }
  })
  .put(async (req, res) => {
    try {
      const Model = getDynamicModel(req.params.collectionName);
      let updateData = { ...req.body, schoolId: req.params.uid, docId: req.params.docId };
      const updated = await Model.findOneAndUpdate(
        { schoolId: req.params.uid, docId: req.params.docId }, 
        updateData, 
        { new: true, upsert: true }
      );
      res.json(updated);
    } catch (err) { res.status(500).json({ error: err.message }); }
  })
  .patch(async (req, res) => {
    try {
      const Model = getDynamicModel(req.params.collectionName);
      
      // Handle Flutter's dot notation (e.g., 'attendance.25-08-2026': 'P')
      let updateQuery = { $set: {} };
      let unsetQuery = { $unset: {} };
      
      for (let key in req.body) {
        if (req.body[key] === null) {
          unsetQuery.$unset[key] = "";
        } else {
          updateQuery.$set[key] = req.body[key];
        }
      }

      let finalUpdate = {};
      if (Object.keys(updateQuery.$set).length > 0) finalUpdate = { ...finalUpdate, ...updateQuery };
      if (Object.keys(unsetQuery.$unset).length > 0) finalUpdate = { ...finalUpdate, ...unsetQuery };

      const updated = await Model.findOneAndUpdate(
        { schoolId: req.params.uid, docId: req.params.docId }, 
        finalUpdate, 
        { new: true }
      );
      res.json(updated || {});
    } catch (err) { res.status(500).json({ error: err.message }); }
  })
  .delete(async (req, res) => {
    try {
      const Model = getDynamicModel(req.params.collectionName);
      // Mongoose _id vs Custom docId detection
      let query = req.params.docId.length === 24 ? { _id: req.params.docId } : { schoolId: req.params.uid, docId: req.params.docId };
      await Model.findOneAndDelete(query);
      res.json({ success: true, message: "Deleted Successfully" });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

// ==========================================
// 🟢 7. Active Rooms (Live Exam & Meetings)
// ==========================================
const ActiveRoom = getDynamicModel('active_rooms');

app.post('/api/active_rooms', async (req, res) => {
  try {
    const newRoom = new ActiveRoom({ ...req.body, docId: req.body.roomId });
    await newRoom.save();
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
    const updated = await ActiveRoom.findOneAndUpdate({ docId: req.params.roomId }, { $set: req.body }, { new: true });
    res.json(updated || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/active_rooms/:roomId', async (req, res) => {
  try {
    await ActiveRoom.findOneAndDelete({ docId: req.params.roomId });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Room Sub-collections (Participants, Questions, Signaling, Chat) ---
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
    res.status(201).json({ success: true, id: newDoc._id.toString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/active_rooms/:roomId/:subCollection/:subDocId', async (req, res) => {
  try {
    const Model = getDynamicModel(`room_${req.params.roomId}_${req.params.subCollection}`);
    const updated = await Model.findOneAndUpdate({ docId: req.params.subDocId }, { ...req.body, docId: req.params.subDocId }, { new: true, upsert: true });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/active_rooms/:roomId/:subCollection/:subDocId', async (req, res) => {
  try {
    const Model = getDynamicModel(`room_${req.params.roomId}_${req.params.subCollection}`);
    const updated = await Model.findOneAndUpdate({ docId: req.params.subDocId }, { $set: req.body }, { new: true });
    res.json(updated || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/active_rooms/:roomId/:subCollection/:subDocId', async (req, res) => {
  try {
    const Model = getDynamicModel(`room_${req.params.roomId}_${req.params.subCollection}`);
    await Model.findOneAndDelete({ docId: req.params.subDocId });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 🟢 Global Developer Feedbacks (Without UID in path)
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
// 🟢 8. Server Start
// ==========================================
const PORT = process.env.PORT || 10000; // Render uses dynamic ports
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Master Backend Server is running on Port: ${PORT}`);
});