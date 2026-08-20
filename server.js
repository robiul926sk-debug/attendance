const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// 🟢 Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // বড় ছবি বা ডেটা রিসিভ করার জন্য লিমিট বাড়ানো হলো
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ==========================================
// 🟢 MongoDB ক্লাউড কানেকশন (আপনার দেওয়া লিংক)
// ==========================================
mongoose.connect('mongodb+srv://robiul926sk_db_user:X35cF8uk3qXGabH8@cluster0.axgj0zh.mongodb.net/greenland_school_db?appName=Cluster0')
  .then(() => console.log("✅ MongoDB Cloud Connected Successfully!"))
  .catch((err) => console.log("❌ DB Connection Error:", err));

// ==========================================
// 🟢 Socket.io সেটআপ (Live Chat, Calling & WebRTC)
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

  socket.on('send_message', (data) => {
    io.to(data.roomId).emit('receive_message', data);
  });

  socket.on('disconnect', () => {
    console.log('🔴 User Disconnected:', socket.id);
  });
});

// ==========================================
// 🟢 Mongoose Schemas (আপনার ফ্লাটার মডেল অনুযায়ী)
// ==========================================

const schoolSchema = new mongoose.Schema({ uid: String, schoolName: String, currentPlan: String, end_date: Number, export_history: Array, import_history: Array }, { strict: false });
const School = mongoose.model('School', schoolSchema);

const studentSchema = new mongoose.Schema({ schoolId: String, roll: String, name: String, className: String, attendance: Object, subjectMarks: Object }, { strict: false });
const Student = mongoose.model('Student', studentSchema);

const teacherSchema = new mongoose.Schema({ schoolId: String, id: String, name: String, attendance: Object, isAssistantAdmin: Boolean }, { strict: false });
const Teacher = mongoose.model('Teacher', teacherSchema);

const activeRoomSchema = new mongoose.Schema({ roomId: String, status: String, className: String, subject: String, hostId: String, createdAt: Number, chatDisabled: Boolean }, { strict: false });
const ActiveRoom = mongoose.model('ActiveRoom', activeRoomSchema);

const callRequestSchema = new mongoose.Schema({ studentId: String, targetId: String, status: String, timestamp: Number }, { strict: false });
const CallRequest = mongoose.model('CallRequest', callRequestSchema);

const feedbackSchema = new mongoose.Schema({ senderId: String, text: String, status: String, timestamp: Number }, { strict: false });
const Feedback = mongoose.model('Feedback', feedbackSchema);

const settingSchema = new mongoose.Schema({ uid: String, settingType: String, data: Object }, { strict: false });
const Setting = mongoose.model('Setting', settingSchema);


// ==========================================
// 🟢 API Routes (আপনার ফ্লাটারের রিকোয়েস্ট অনুযায়ী)
// ==========================================

// 📌 1. Admin/School Data Fetch & Update
app.get('/api/users/:uid', async (req, res) => {
  try {
    let school = await School.findOne({ uid: req.params.uid });
    if(!school) school = new School({ uid: req.params.uid, currentPlan: "7 Days Ads Plan", end_date: Date.now() + (7*24*60*60*1000) });
    res.json(school);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/users/:uid', async (req, res) => {
  try {
    const updated = await School.findOneAndUpdate({ uid: req.params.uid }, { $set: req.body }, { new: true, upsert: true });
    res.json({ success: true, data: updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 📌 2. Students & Attendance Management
app.get('/api/users/:uid/students', async (req, res) => {
  try {
    const students = await Student.find({ schoolId: req.params.uid });
    res.json(students);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/users/:uid/students/student_:roll', async (req, res) => {
  try {
    const student = await Student.findOne({ schoolId: req.params.uid, roll: req.params.roll });
    res.json(student || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/users/:uid/students/student_:roll', async (req, res) => {
  try {
    const data = { ...req.body, schoolId: req.params.uid, roll: req.params.roll };
    const saved = await Student.findOneAndUpdate({ schoolId: req.params.uid, roll: req.params.roll }, data, { new: true, upsert: true });
    res.json(saved);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/users/:uid/students/student_:roll', async (req, res) => {
  try {
    // Attendance বা অন্য স্পেসিফিক ফিল্ড আপডেট করার জন্য
    const updated = await Student.findOneAndUpdate({ schoolId: req.params.uid, roll: req.params.roll }, { $set: req.body }, { new: true });
    res.json(updated || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 📌 3. Teachers Management
app.get('/api/users/:uid/teachers/:id', async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ schoolId: req.params.uid, id: req.params.id });
    res.json(teacher || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/users/:uid/teachers/:id', async (req, res) => {
  try {
    const data = { ...req.body, schoolId: req.params.uid, id: req.params.id };
    const saved = await Teacher.findOneAndUpdate({ schoolId: req.params.uid, id: req.params.id }, data, { new: true, upsert: true });
    res.json(saved);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/users/:uid/teachers/:id', async (req, res) => {
  try {
    const updated = await Teacher.findOneAndUpdate({ schoolId: req.params.uid, id: req.params.id }, { $set: req.body }, { new: true });
    res.json(updated || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 📌 4. Active Rooms (Live Exam / WebRTC Meetings)
app.post('/api/active_rooms', async (req, res) => {
  try {
    const newRoom = new ActiveRoom(req.body);
    await newRoom.save();
    res.status(201).json({ success: true, id: newRoom.roomId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/active_rooms/:roomId', async (req, res) => {
  try {
    const room = await ActiveRoom.findOne({ roomId: req.params.roomId });
    if(room) res.json(room);
    else res.status(404).json({ error: "Room not found" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/active_rooms/:roomId', async (req, res) => {
  try {
    const updated = await ActiveRoom.findOneAndUpdate({ roomId: req.params.roomId }, { $set: req.body }, { new: true });
    res.json(updated || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 📌 5. Call Requests (Smart Calling Engine)
app.post('/api/users/:uid/call_requests', async (req, res) => {
  try {
    const newCall = new CallRequest({ ...req.body, schoolId: req.params.uid });
    await newCall.save();
    res.status(201).json({ success: true, id: newCall._id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/users/:uid/call_requests', async (req, res) => {
  try {
    const filter = { schoolId: req.params.uid };
    if(req.query.status) filter.status = req.query.status;
    if(req.query.targetId) filter.targetId = req.query.targetId;
    if(req.query.studentId) filter.studentId = req.query.studentId;
    
    const calls = await CallRequest.find(filter);
    res.json(calls.map(c => ({ id: c._id, ...c._doc }))); // ফ্লাটারে id হিসেবে পাঠানোর জন্য
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/users/:uid/call_requests/:id', async (req, res) => {
  try {
    const updated = await CallRequest.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    res.json(updated || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 📌 6. Developer Feedback / Suggestions
app.post('/api/developer_feedbacks', async (req, res) => {
  try {
    const newFeedback = new Feedback(req.body);
    await newFeedback.save();
    res.status(201).json({ success: true, id: newFeedback._id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/developer_feedbacks', async (req, res) => {
  try {
    const filter = {};
    if(req.query.status) filter.status = req.query.status;
    if(req.query.senderId) filter.senderId = req.query.senderId;
    
    const feedbacks = await Feedback.find(filter);
    res.json(feedbacks.map(f => ({ id: f._id, ...f._doc })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/developer_feedbacks/:id', async (req, res) => {
  try {
    const updated = await Feedback.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    res.json(updated || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 📌 7. Global Settings (Marksheet, Holiday, Routine)
app.get('/api/users/:uid/settings/:settingType', async (req, res) => {
  try {
    const setting = await Setting.findOne({ uid: req.params.uid, settingType: req.params.settingType });
    res.json(setting ? setting.data : {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/users/:uid/settings/:settingType', async (req, res) => {
  try {
    const saved = await Setting.findOneAndUpdate(
      { uid: req.params.uid, settingType: req.params.settingType },
      { data: req.body },
      { new: true, upsert: true }
    );
    res.json(saved.data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/users/:uid/settings/:settingType', async (req, res) => {
  try {
    // Object এর ভেতরে স্পেসিফিক ফিল্ড আপডেট করার জন্য
    const setting = await Setting.findOne({ uid: req.params.uid, settingType: req.params.settingType });
    let newData = setting ? setting.data : {};
    newData = { ...newData, ...req.body };
    
    const updated = await Setting.findOneAndUpdate(
      { uid: req.params.uid, settingType: req.params.settingType },
      { data: newData },
      { new: true, upsert: true }
    );
    res.json(updated.data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 🟢 Server Start
// ==========================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Master Backend Server is running on Port: ${PORT}`);
});