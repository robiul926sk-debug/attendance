const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken'); // 🟢 JWT ইমপোর্ট করা হলো

// ==========================================
// 🟢 ADDED: Firebase Admin for Push Notifications
// ==========================================
const admin = require('firebase-admin');
// admin.initializeApp({ credential: admin.credential.cert(...) }); // ⚠️ Uncomment and configure your firebase service account here

async function sendPushNotification(topicOrToken, title, body, type) {
  try {
    if (!topicOrToken) return;
    const safeTopic = topicOrToken.replace(/[^a-zA-Z0-9-_.~%]+/g, '_'); // Safety for Firebase topic rules
    const message = {
      notification: { title, body },
      data: { type: type || 'alert' },
      topic: safeTopic
    };
    await admin.messaging().send(message);
    console.log(`Push sent to ${safeTopic}: ${title}`);
  } catch (e) {
    console.log("Push Notification Error:", e.message);
  }
}

const app = express();
const server = http.createServer(app);

// ==========================================
// 🟢 1. Middleware Setup
// ==========================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ==========================================
// 🟢 JWT Authentication Middleware
// ==========================================
const JWT_SECRET = process.env.JWT_SECRET || "my_super_secret_key_2026";

const verifyToken = (req, res, next) => {
    // হেডার থেকে টোকেন বের করা
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(403).json({ error: "Access Denied! No token provided." });
    }

    const token = authHeader.split(' ')[1]; // 'Bearer TOKEN' থেকে শুধু টোকেনটা নেওয়া

    try {
        // টোকেন যাচাই করা
        const verified = jwt.verify(token, JWT_SECRET);
        req.user = verified; // ভেরিফাইড ইউজারের ডেটা req.user এ সেভ করা
        next(); // টোকেন সঠিক হলে পরের ধাপে (API logic) যেতে দেবে
    } catch (err) {
        res.status(401).json({ error: "Invalid or Expired Token!" });
    }
};

// ==========================================
// 🟢 2. MongoDB Cloud Connection
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
// 🟢 4. Security & Encryption
// ==========================================
// 🔴 ম্যাজিক ফিক্স: আপনি ফ্লাটার থেকে এনক্রিপশন সরিয়ে দিয়েছেন, তাই সার্ভার থেকেও এনক্রিপশন ফাংশন সম্পূর্ণভাবে মুছে দেওয়া হলো!
// এতে প্রোফাইলে আধার বা ফাদার নেম আর ফাঁকা দেখাবে না।

// ==========================================
// 🟢 5. Dynamic Model Generator & Explicit Models
// ==========================================
const getDynamicModel = (collectionName) => {
  if (mongoose.models[collectionName]) return mongoose.models[collectionName];
  const schema = new mongoose.Schema({}, { strict: false, versionKey: false });
  return mongoose.model(collectionName, schema, collectionName);
};

const schoolSchema = new mongoose.Schema({ uid: String }, { strict: false, versionKey: false });
// 🟢 ম্যাজিক ফিক্স: ডাটাবেসের ফোল্ডারের সাথে হুবহু মিল রেখে 'School' করা হলো
const School = mongoose.models.School || mongoose.model('School', schoolSchema, 'School');

const studentSchema = new mongoose.Schema({ schoolId: String, docId: String }, { strict: false });
const Student = mongoose.models.Student || mongoose.model('Student', studentSchema, 'students');

const teacherSchema = new mongoose.Schema({ schoolId: String, docId: String }, { strict: false });
const Teacher = mongoose.models.Teacher || mongoose.model('Teacher', teacherSchema, 'teachers');


// ==========================================
// 🟢 6. DEVELOPER PANEL: GLOBAL SETTINGS
// ==========================================
const DeveloperSettings = getDynamicModel('developer_settings');

// 🟢 গ্লোবাল সেটিংস পেতে টোকেন ভেরিফাই করার দরকার নেই (Public)
app.get('/api/developer_settings/global', async (req, res) => {
  try {
    let settings = await DeveloperSettings.findOne({ docId: 'global' });
    if (!settings) {
      settings = new DeveloperSettings({ docId: 'global' });
      await settings.save();
    }
    res.json(settings);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 🟢 গ্লোবাল সেটিংস আপডেট করতে অবশ্যই ভেরিফাই করতে হবে
app.patch('/api/developer_settings/global', verifyToken, async (req, res) => {
  try {
    const updated = await DeveloperSettings.findOneAndUpdate(
      { docId: 'global' }, { $set: req.body }, { new: true, upsert: true }
    );
    io.emit('global_settings_updated', updated); 

    // 🟢 ADDED FOR NOTIFICATION: Global Notice and Global Coupon
    if (req.body.developerNotice && req.body.developerNotice.isActive) {
      sendPushNotification("all_users", "Important System Notice 🚀", req.body.developerNotice.text, "global_notice");
    }
    if (req.body.globalCoupons || req.body.milestoneCoupons) {
      sendPushNotification("all_admins", "New Special Offer! 🎁", "A new discount coupon is available. Check your Rewards section now!", "coupon");
    }

    res.json(updated || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 🟢 Settings ফোল্ডার থেকে ডেটা ফেচ করার API
app.get('/api/settings', verifyToken, async (req, res) => {
  try {
    // 🟢 ম্যাজিক ফিক্স: আপনার তৈরি করা ডাইনামিক মডেল ব্যবহার করা হলো (db error হবে না)
    const SettingsModel = getDynamicModel('settings');
    const settingsData = await SettingsModel.find({});
    res.status(200).json(settingsData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 🟢 7. ADMIN & USER CHECKING
// ==========================================

app.get('/api/users', verifyToken, async (req, res) => {
  try {
    const users = await School.find(req.query);
    res.status(200).json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/users/:uid', verifyToken, async (req, res) => {
  try {
    let school = await School.findOne({ uid: req.params.uid });
    if (!school) {
      school = await School.findById(req.params.uid);
    }
    if (school) {
      res.status(200).json(school);
    } else {
      res.status(404).json({ message: "User not found" });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

async function calculateReadableEndDate(uid, updateData) {
  if (updateData.end_date) {
    let parsedDate = new Date(updateData.end_date);
    if (!isNaN(parsedDate)) {
      return parsedDate.toISOString();
    }
  }

  if (updateData.currentPlan) {
    let planName = updateData.currentPlan.toLowerCase();
    let addedDays = 30;
    if (planName.includes("7 days") || planName.includes("week") || planName.includes("49")) addedDays = 7;
    if (planName.includes("3 months")) addedDays = 90;
    if (planName.includes("1 year") || planName.includes("1499")) addedDays = 365;

    const currentSchool = await School.findOne({ uid: uid });
    let baseDate = new Date();

    if (currentSchool && currentSchool.end_date) {
      let existingDate = new Date(currentSchool.end_date);
      if (!isNaN(existingDate) && existingDate > baseDate) {
        baseDate = existingDate;
      }
    }

    baseDate.setDate(baseDate.getDate() + addedDays);
    return baseDate.toISOString();
  }

  return updateData.end_date;
}

app.put('/api/users/:uid', verifyToken, async (req, res) => {
  try {
    let updateData = { ...req.body };
    
    // 🟢 ম্যাজিক ফিক্স: রেজিস্ট্রেশনের সময় uid যেন ১০০% সেভ হয় তার গ্যারান্টি!
    updateData.uid = req.params.uid;

    if (updateData.end_date || updateData.currentPlan) {
      updateData.end_date = await calculateReadableEndDate(req.params.uid, updateData);
    }

    const updated = await School.findOneAndUpdate(
      { uid: req.params.uid }, 
      { $set: updateData }, 
      { new: true, upsert: true } 
    );
    
    io.to(req.params.uid).emit('data_updated', { type: 'school_data' });
    io.emit('user_plan_updated', updated); 

    // 🟢 ADDED FOR NOTIFICATION: Admin Block / Unblock
    if (updateData.isBlocked === true) {
      sendPushNotification(req.params.uid, "Account Suspended 🚫", "Your account has been suspended by the Super Admin.", "alert");
    } else if (updateData.isBlocked === false) {
      sendPushNotification(req.params.uid, "Account Unblocked ✅", "Your account restrictions have been lifted.", "alert");
    }

    res.json({ success: true, data: updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/users/:uid', verifyToken, async (req, res) => {
  try {
    let updateData = { ...req.body };
    
    // 🟢 ম্যাজিক ফিক্স: এখানেও uid ফোর্স করে সেভ করানো হলো
    updateData.uid = req.params.uid;

    if (updateData.end_date || updateData.currentPlan) {
      updateData.end_date = await calculateReadableEndDate(req.params.uid, updateData);
    }

    const updated = await School.findOneAndUpdate(
      { uid: req.params.uid }, 
      { $set: updateData }, 
      { new: true, upsert: true }
    );
    io.to(req.params.uid).emit('data_updated', { type: 'school_data' });
    io.emit('user_plan_updated', updated); 

    // 🟢 ADDED FOR NOTIFICATION: Admin Block / Unblock
    if (updateData.isBlocked === true) {
      sendPushNotification(req.params.uid, "Account Suspended 🚫", "Your account has been suspended by the Super Admin.", "alert");
    } else if (updateData.isBlocked === false) {
      sendPushNotification(req.params.uid, "Account Unblocked ✅", "Your account restrictions have been lifted.", "alert");
    }

    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ==========================================
// 🟢 8. MASTER LOGIN API
// ==========================================
app.post('/api/login', async (req, res) => {
  try {
    const { role, schoolId, userId, password } = req.body;
    let userData = null;

    if (role === "admin") {
      const school = await School.findOne({ uid: userId });
      if (!school) return res.status(404).json({ error: "Admin ID not found!" });
      if (password !== school.password) return res.status(400).json({ error: "Invalid Password!" });
      userData = school;
    } else if (role === "student") {
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
      
      userData = student;
    } else if (role === "teacher") {
      const teacher = await Teacher.findOne({ schoolId: schoolId, docId: userId });
      if (!teacher) return res.status(404).json({ error: "Teacher not found!" });
      if (teacher.loginEnabled === false) return res.status(403).json({ error: "Login disabled by Admin." });
      if (password !== teacher.password) return res.status(400).json({ error: "Invalid Password!" });
      
      userData = teacher;
    } else {
        return res.status(400).json({ error: "Invalid Role!" });
    }

    // 🟢 লগইন সাকসেস হলে JWT টোকেন জেনারেট করে পাঠানো
    const token = jwt.sign({ uid: userId, role: role, schoolId: schoolId }, JWT_SECRET, { expiresIn: '30d' }); // 30 দিন ভ্যালিডিটি

    return res.json({ success: true, data: userData, token: token }); // 🟢 টোকেন রেসপন্সে অ্যাড করা হলো

  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ==========================================
// 🟢 8.5. MASTER REGISTER API
// ==========================================
app.post('/api/register', async (req, res) => {
  try {
    const { uid, email, password, role, ...otherData } = req.body;
    
    let existingSchool = await School.findOne({ uid: uid });
    if (existingSchool) {
      return res.status(400).json({ error: "School already registered with this UID." });
    }

    const newSchool = new School({ 
      uid: uid, 
      email: email, 
      password: password, 
      role: role || "admin", 
      ...otherData 
    });
    
    await newSchool.save();

    // 🟢 রেজিস্ট্রেশন সাকসেস হলেও অটো লগইনের জন্য টোকেন দিয়ে দেওয়া হলো
    const token = jwt.sign({ uid: uid, role: role || "admin", schoolId: uid }, JWT_SECRET, { expiresIn: '30d' });

    io.to(uid).emit('data_updated', { type: 'school_data' });
    return res.status(201).json({ success: true, data: newSchool, token: token });
    
  } catch (error) { 
    console.error("Registration Error:", error);
    res.status(500).json({ error: error.message }); 
  }
});


// ==========================================
// 🟢 9. Dynamic Firebase-like Routing Engine
// ==========================================
app.get('/api/users/:uid/:collectionName', verifyToken, async (req, res) => {
  try {
    const Model = getDynamicModel(req.params.collectionName);
    const filter = { schoolId: req.params.uid, ...req.query };
    const data = await Model.find(filter);
    
    const formattedData = data.map(d => {
      let obj = { id: d.docId || d._id.toString(), ...d._doc };
      return obj; // 🔴 এনক্রিপশন রিমুভড
    });

    res.json(formattedData);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users/:uid/:collectionName', verifyToken, async (req, res) => {
  try {
    const Model = getDynamicModel(req.params.collectionName);
    let dataToSave = { ...req.body, schoolId: req.params.uid };
    
    const newDoc = new Model(dataToSave);
    await newDoc.save();
    
    if (req.params.collectionName === 'call_requests' && dataToSave.status === 'Called Now') {
      io.to(dataToSave.targetId).emit('incoming_call', { ...dataToSave, id: newDoc._id.toString() });
    }

    io.to(req.params.uid).emit('data_updated', { type: req.params.collectionName });

    // 🟢 ADDED FOR NOTIFICATION: Universal POST (Homework, Doubts, Admin Request)
    if (req.params.collectionName === 'homework') {
      let topicClass = req.body.className ? req.body.className.replace(/\s+/g, '_') : 'all';
      sendPushNotification(`class_${topicClass}`, "New Homework Assigned 📚", `Homework assigned for ${req.body.subject || 'your class'}. Check the app!`, "homework");
    }
    if (req.params.collectionName === 'doubts') {
      let target = req.body.targetTeacherId || req.body.studentRoll;
      if (target) sendPushNotification(target, "New Query/Doubt Received ❓", "You have received a new message regarding a doubt.", "doubt");
    }
    if (['pending_students', 'pending_payments', 'teacher_attendance_requests'].includes(req.params.collectionName)) {
      sendPushNotification(req.params.uid, "New Request Received 🔔", "A teacher has submitted a new request for approval.", "admin_request");
    }

    res.status(201).json({ success: true, id: newDoc._id.toString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.route('/api/users/:uid/:collectionName/:docId')
  .get(verifyToken, async (req, res) => {
    try {
      const Model = getDynamicModel(req.params.collectionName);
      let query = req.params.docId.length === 24 ? { _id: req.params.docId } : { schoolId: req.params.uid, docId: req.params.docId };
      const data = await Model.findOne(query);
      
      if (data) {
        let obj = { id: data.docId || data._id.toString(), ...data._doc };
        res.json(obj); // 🔴 এনক্রিপশন রিমুভড
      }
      else res.status(404).json({ error: "Not Found" });
    } catch (err) { res.status(500).json({ error: err.message }); }
  })
  .put(verifyToken, async (req, res) => {
    try {
      const Model = getDynamicModel(req.params.collectionName);
      let updateData = { ...req.body, schoolId: req.params.uid, docId: req.params.docId };
      let query = req.params.docId.length === 24 ? { _id: req.params.docId } : { schoolId: req.params.uid, docId: req.params.docId };
      
      if (req.params.collectionName === 'my_coupons') query = { code: req.params.docId };

      const updated = await Model.findOneAndUpdate(
        query,
        { $set: updateData }, 
        { new: true, upsert: true }
      );
      
      io.to(req.params.uid).emit('data_updated', { type: req.params.collectionName });

      // 🟢 ADDED FOR NOTIFICATION: User unlocks a coupon
      if (req.params.collectionName === 'my_coupons' && req.body.code) {
        sendPushNotification(req.params.uid, "Coupon Unlocked! 🎉", `You've successfully unlocked a ${req.body.discount}% discount coupon. Check your rewards!`, "coupon_unlocked");
      }

      res.json(updated);
    } catch (err) { res.status(500).json({ error: err.message }); }
  })
  .patch(verifyToken, async (req, res) => {
    try {
      const Model = getDynamicModel(req.params.collectionName);
      let updateQuery = { $set: {} };
      let unsetQuery = { $unset: {} };
      
      let query = req.params.docId.length === 24 ? { _id: req.params.docId } : { schoolId: req.params.uid, docId: req.params.docId };
      let existingDoc = await Model.findOne(query);

      if (req.params.collectionName === 'call_requests') {
        if (req.body.status === 'Rejected') {
          if (existingDoc) {
            await Model.findOneAndDelete(query);
            let caller = existingDoc.callerId || existingDoc.studentId;
            if (caller) io.to(caller).emit('call_ended', { docId: req.params.docId });
            if (existingDoc.targetId) io.to(existingDoc.targetId).emit('call_ended', { docId: req.params.docId });
          }
          return res.json({ success: true, message: "Rejected and History Deleted" });
        }
        else if (req.body.status === 'Ended' || req.body.status === 'Missed') {
          if (existingDoc) {
            let caller = existingDoc.callerId || existingDoc.studentId;
            if (caller) io.to(caller).emit('call_ended', { docId: req.params.docId });
            if (existingDoc.targetId) io.to(existingDoc.targetId).emit('call_ended', { docId: req.params.docId });
          }
        }
        else if (req.body.status === 'Accepted' || req.body.status === 'In Call') {
          if (existingDoc) {
            let caller = existingDoc.callerId || existingDoc.studentId;
            if (caller) io.to(caller).emit('call_answered', { docId: req.params.docId });
          }
        }
      }

      for (let key in req.body) {
        if (req.body[key] === null) unsetQuery.$unset[key] = "";
        else updateQuery.$set[key] = req.body[key]; // 🔴 এনক্রিপশন রিমুভড
      }

      let finalUpdate = {};
      if (Object.keys(updateQuery.$set).length > 0) finalUpdate = { ...finalUpdate, ...updateQuery };
      if (Object.keys(unsetQuery.$unset).length > 0) finalUpdate = { ...finalUpdate, ...unsetQuery };

      const updated = await Model.findOneAndUpdate(
        query,
        finalUpdate,
        { new: true, upsert: true }
      );
      
      io.to(req.params.uid).emit('data_updated', { type: req.params.collectionName });

      // 🟢 ADDED FOR NOTIFICATION: Universal Actions (Holidays, Approvals, Attendance, Fees)
      if (req.params.collectionName === 'settings' && req.params.docId === 'holiday_calendar') {
         const dateKeys = Object.keys(req.body);
         if(dateKeys.length > 0) {
           sendPushNotification("all_users", "Holiday Declared 🏖️", `A new holiday has been declared on ${dateKeys[0]}.`, "holiday"); 
         }
      }
      if (req.body.status === 'Approved' || req.body.status === 'Approved ✅') {
         if (req.body.teacherId) sendPushNotification(req.body.teacherId, "Request Approved ✅", "Your request has been approved by the Admin.", "approval");
         if (req.body.studentRoll) sendPushNotification(req.body.studentRoll, "Update Successful 🎉", "Your profile/fees have been updated successfully.", "student_update");
      }
      if (req.body.status === 'Rejected' || req.body.status === 'Rejected ❌') {
         if (req.body.teacherId) sendPushNotification(req.body.teacherId, "Request Rejected ❌", "Your request was declined by the Admin.", "rejection");
      }
      if (req.params.collectionName === 'call_requests' && req.body.status === 'Scheduled') {
         if (updated && updated.studentId) sendPushNotification(updated.studentId, "Call Scheduled ⏰", `Your call request has been scheduled for ${req.body.scheduledTime}.`, "call_update");
      }
      if (req.params.collectionName === 'students' && req.body.attendance) {
         let roll = req.params.docId.replace('student_', '');
         sendPushNotification(roll, "Attendance Update 📅", "Your attendance has been updated. Please check your dashboard.", "attendance");
      }
      if (req.params.collectionName === 'students' && req.body.feeHistory) {
         let roll = req.params.docId.replace('student_', '');
         sendPushNotification(roll, "Payment Received 💰", "Your fee payment has been successfully recorded. Thank you!", "fees");
      }

      res.json(updated || {});
    } catch (err) { res.status(500).json({ error: err.message }); }
  })
  .delete(verifyToken, async (req, res) => {
    try {
      const Model = getDynamicModel(req.params.collectionName);
      let query = req.params.docId.length === 24 ? { _id: req.params.docId } : { schoolId: req.params.uid, docId: req.params.docId };
      
      const deletedDoc = await Model.findOneAndDelete(query);
      
      if (deletedDoc) {
         if (req.params.collectionName === 'students') {
             let roll = deletedDoc.roll || deletedDoc.docId.replace('student_', '');
             await getDynamicModel('doubts').deleteMany({ studentRoll: roll, schoolId: req.params.uid });
             await getDynamicModel('pending_payments').deleteMany({ studentRoll: roll, schoolId: req.params.uid });
             await getDynamicModel('call_requests').deleteMany({ $or: [{ studentId: roll }, { targetId: roll }, { callerId: roll }], schoolId: req.params.uid });
             await getDynamicModel('pending_students').deleteMany({ 'studentData.roll': roll, schoolId: req.params.uid });
         }
         else if (req.params.collectionName === 'teachers') {
             let tId = deletedDoc.docId || deletedDoc.id || deletedDoc._id.toString();
             await getDynamicModel('doubts').deleteMany({ targetTeacherId: tId, schoolId: req.params.uid });
             await getDynamicModel('pending_payments').deleteMany({ teacherId: tId, schoolId: req.params.uid });
             await getDynamicModel('call_requests').deleteMany({ $or: [{ targetId: tId }, { callerId: tId }, { teacherId: tId }], schoolId: req.params.uid });
             await getDynamicModel('teacher_attendance_requests').deleteMany({ teacherId: tId, schoolId: req.params.uid });
         }
      }

      io.to(req.params.uid).emit('data_updated', { type: req.params.collectionName });
      res.json({ success: true, message: "Deleted Successfully and Database Cleaned!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

app.delete('/api/users/:uid/:collectionName', verifyToken, async (req, res) => {
  try {
    if (req.params.collectionName === 'homework' && req.query.subject && req.query.className) {
      const Model = getDynamicModel('homework');
      await Model.deleteMany({ schoolId: req.params.uid, className: req.query.className, subject: req.query.subject });
      io.to(req.params.uid).emit('data_updated', { type: 'homework' });
      return res.json({ success: true, message: "Subject Homeworks Deleted Successfully" });
    }

    const Model = getDynamicModel(req.params.collectionName);
    const filter = { schoolId: req.params.uid, ...req.query };
    await Model.deleteMany(filter);
    
    io.to(req.params.uid).emit('data_updated', { type: req.params.collectionName });
    res.json({ success: true, message: "Bulk Delete Successful!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ==========================================
// 🟢 10. Active Rooms (Live Exam & WebRTC)
// ==========================================
const ActiveRoom = getDynamicModel('active_rooms');

app.post('/api/active_rooms', verifyToken, async (req, res) => {
  try {
    const newRoom = new ActiveRoom({ ...req.body, docId: req.body.roomId });
    await newRoom.save();
    io.emit('room_updated', newRoom.docId);

    // 🟢 ADDED FOR NOTIFICATION: New Exam Room Created
    if (req.body.status === 'setup' && req.body.className) {
      let topicClass = req.body.className.replace(/\s+/g, '_');
      sendPushNotification(`class_${topicClass}`, "New Live Exam Scheduled 📝", `An exam room (${req.body.roomId}) has been created for your class. Be prepared!`, "exam");
    }

    res.status(201).json({ success: true, id: newRoom.docId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/active_rooms', verifyToken, async (req, res) => {
  try {
    const rooms = await ActiveRoom.find(req.query);
    res.json(rooms.map(r => ({ id: r.docId, ...r._doc })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/active_rooms/:roomId', verifyToken, async (req, res) => {
  try {
    const room = await ActiveRoom.findOne({ docId: req.params.roomId });
    if(room) res.json(room); else res.status(404).json({ error: "Room not found" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/active_rooms/:roomId', verifyToken, async (req, res) => {
  try {
    const updated = await ActiveRoom.findOneAndUpdate({ docId: req.params.roomId }, { $set: req.body }, { new: true, upsert: true });
    io.emit('room_updated', req.params.roomId);
    res.json(updated || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/active_rooms/:roomId', verifyToken, async (req, res) => {
  try {
    await ActiveRoom.findOneAndDelete({ docId: req.params.roomId });
    io.emit('room_updated', req.params.roomId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/active_rooms/:roomId/:subCollection', verifyToken, async (req, res) => {
  try {
    const Model = getDynamicModel(`room_${req.params.roomId}_${req.params.subCollection}`);
    const data = await Model.find(req.query);
    res.json(data.map(d => ({ id: d.docId || d._id.toString(), ...d._doc })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/active_rooms/:roomId/:subCollection/:subDocId', verifyToken, async (req, res) => {
  try {
    const Model = getDynamicModel(`room_${req.params.roomId}_${req.params.subCollection}`);
    const data = await Model.findOne({ docId: req.params.subDocId });
    res.json(data || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/active_rooms/:roomId/:subCollection', verifyToken, async (req, res) => {
  try {
    const Model = getDynamicModel(`room_${req.params.roomId}_${req.params.subCollection}`);
    const newDoc = new Model({ ...req.body, docId: req.body.id || req.body.roomId });
    await newDoc.save();
    io.emit('room_sub_updated', req.params.roomId);

    // 🟢 ADDED FOR NOTIFICATION: Chat Message
    if (req.params.subCollection === 'chat') {
      sendPushNotification(`room_${req.params.roomId}`, `New Message from ${req.body.senderName || 'Participant'} 💬`, req.body.message || "New message received in the room.", "chat");
    }

    res.status(201).json({ success: true, id: newDoc._id.toString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/active_rooms/:roomId/:subCollection/:subDocId', verifyToken, async (req, res) => {
  try {
    const Model = getDynamicModel(`room_${req.params.roomId}_${req.params.subCollection}`);
    const updated = await Model.findOneAndUpdate({ docId: req.params.subDocId }, { ...req.body, docId: req.params.subDocId }, { new: true, upsert: true });
    io.emit('room_sub_updated', req.params.roomId);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/active_rooms/:roomId/:subCollection/:subDocId', verifyToken, async (req, res) => {
  try {
    const Model = getDynamicModel(`room_${req.params.roomId}_${req.params.subCollection}`);
    const updated = await Model.findOneAndUpdate({ docId: req.params.subDocId }, { $set: req.body }, { new: true, upsert: true });
    io.emit('room_sub_updated', req.params.roomId);
    res.json(updated || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/active_rooms/:roomId/:subCollection/:subDocId', verifyToken, async (req, res) => {
  try {
    const Model = getDynamicModel(`room_${req.params.roomId}_${req.params.subCollection}`);
    await Model.findOneAndDelete({ docId: req.params.subDocId });
    io.emit('room_sub_updated', req.params.roomId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ==========================================
// 🟢 11. Global Developer Feedbacks
// ==========================================
const Feedback = getDynamicModel('developer_feedbacks');
app.get('/api/developer_feedbacks', verifyToken, async (req, res) => {
  try {
    const feedbacks = await Feedback.find(req.query);
    res.json(feedbacks.map(f => ({ id: f._id.toString(), ...f._doc })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/developer_feedbacks', verifyToken, async (req, res) => {
  try {
    const f = new Feedback(req.body); await f.save(); res.json({ id: f._id.toString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.patch('/api/developer_feedbacks/:id', verifyToken, async (req, res) => {
  try {
    const updated = await Feedback.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true }); 

    // 🟢 ADDED FOR NOTIFICATION: Feedback Approved / Rejected
    if (updated && req.body.status === 'Approved') {
      sendPushNotification(updated.senderId, "Feedback Accepted! 🎉", "Your valuable feedback has been approved by the Developer.", "feedback");
    } else if (updated && req.body.status === 'Rejected') {
      sendPushNotification(updated.senderId, "Feedback Update", "Your suggestion was reviewed but could not be implemented right now.", "feedback");
    }

    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/developer_feedbacks/:id', verifyToken, async (req, res) => {
  try { await Feedback.findByIdAndDelete(req.params.id); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); }
});


// ==========================================
// 🟢 12. CRON JOB: AUTOMATIC ACCOUNT & RECYCLE BIN DELETION
// ==========================================
setInterval(async () => {
  try {
    const now = Date.now();
    
    const schoolsToDelete = await School.find({
      status: 'pending_deletion',
      scheduledDeletionTime: { $lte: now }
    });

    for (let school of schoolsToDelete) {
      let uid = school.uid;
      await School.findOneAndDelete({ uid: uid });
      await Student.deleteMany({ schoolId: uid });
      await Teacher.deleteMany({ schoolId: uid });
      await getDynamicModel('staffs').deleteMany({ schoolId: uid });
      await getDynamicModel('expenses').deleteMany({ schoolId: uid });
      await getDynamicModel('pending_payments').deleteMany({ schoolId: uid });
      await getDynamicModel('pending_students').deleteMany({ schoolId: uid });
      await getDynamicModel('attendance_requests').deleteMany({ schoolId: uid });
      await getDynamicModel('call_requests').deleteMany({ schoolId: uid });
      
      await getDynamicModel('homework').deleteMany({ schoolId: uid });
      await getDynamicModel('doubts').deleteMany({ schoolId: uid });

      console.log(`✅ Completely erased all data for ${uid}.`);
    }

    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    const modelsToCheck = ['students', 'teachers', 'staffs'];

    for (let collection of modelsToCheck) {
      const Model = getDynamicModel(collection);
      const expiredDocs = await Model.find({ isDeleted: true });

      for (let doc of expiredDocs) {
        if (doc.deletedAt) {
          let deletedDate = new Date(doc.deletedAt).getTime();
          
          if (deletedDate <= sevenDaysAgo) {
            console.log(`🗑️ Auto-deleting expired ${collection} record: ${doc.docId || doc.name}`);
            
            await Model.findByIdAndDelete(doc._id);
            
            if (collection === 'students') {
              let roll = doc.roll || doc.docId.replace('student_', '');
              await getDynamicModel('doubts').deleteMany({ studentRoll: roll, schoolId: doc.schoolId });
              await getDynamicModel('pending_payments').deleteMany({ studentRoll: roll, schoolId: doc.schoolId });
              await getDynamicModel('call_requests').deleteMany({ $or: [{ studentId: roll }, { targetId: roll }, { callerId: roll }], schoolId: doc.schoolId });
              await getDynamicModel('pending_students').deleteMany({ 'studentData.roll': roll, schoolId: doc.schoolId });
            }
            else if (collection === 'teachers') {
              let tId = doc.docId || doc.id;
              await getDynamicModel('doubts').deleteMany({ targetTeacherId: tId, schoolId: doc.schoolId });
              await getDynamicModel('pending_payments').deleteMany({ teacherId: tId, schoolId: doc.schoolId });
              await getDynamicModel('call_requests').deleteMany({ $or: [{ targetId: tId }, { callerId: tId }, { teacherId: tId }], schoolId: doc.schoolId });
              await getDynamicModel('teacher_attendance_requests').deleteMany({ teacherId: tId, schoolId: doc.schoolId });
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("❌ Cron Job Error:", error.message);
  }
}, 60 * 60 * 1000); 


// ==========================================
// 🟢 13. WIPE SESSION DATA (NEW YEAR SETUP)
// ==========================================
app.delete('/api/users/:uid/wipe_session_data', verifyToken, async (req, res) => {
  try {
    const uid = req.params.uid;
    const clearLedger = req.query.clearLedger === 'true';

    console.log(`🧹 Wiping Session Data for School UID: ${uid} | Clear Ledger: ${clearLedger}`);

    await Student.deleteMany({ schoolId: uid });

    await Teacher.updateMany(
      { schoolId: uid },
      { $set: { attendance: {}, paymentHistory: [] } }
    );

    const staffModel = getDynamicModel('staffs');
    await staffModel.updateMany(
      { schoolId: uid },
      { $set: { attendance: {}, paymentHistory: [] } }
    );

    if (clearLedger) {
      const expenseModel = getDynamicModel('expenses');
      await expenseModel.deleteMany({ schoolId: uid });
    }

    const pendingPayModel = getDynamicModel('pending_payments');
    await pendingPayModel.deleteMany({ schoolId: uid });

    const pendingStuModel = getDynamicModel('pending_students');
    await pendingStuModel.deleteMany({ schoolId: uid });

    const attReqModel = getDynamicModel('attendance_requests');
    await attReqModel.deleteMany({ schoolId: uid });

    const callReqModel = getDynamicModel('call_requests');
    await callReqModel.deleteMany({ schoolId: uid });

    const doubtModel = getDynamicModel('doubts');
    await doubtModel.deleteMany({ schoolId: uid });

    res.json({ success: true, message: "Session data wiped successfully for New Year Setup." });
  } catch (err) {
    console.error("❌ Wipe Session Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});


// ==========================================
// 🟢 14. ADMIN SUBSCRIPTION PAYMENT HISTORY
// ==========================================
app.post('/api/users/:uid/subscription_payment', verifyToken, async (req, res) => {
  try {
    const Model = getDynamicModel('subscription_payments');
    
    const newPayment = new Model({
      ...req.body,
      schoolId: req.params.uid,
      timestamp: new Date().getTime(),
      dateString: new Date().toISOString()
    });
    
    await newPayment.save();
    
    io.to(req.params.uid).emit('data_updated', { type: 'subscription_payments' });
    
    res.status(201).json({ success: true, id: newPayment._id.toString(), message: "Subscription payment recorded." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:uid/subscription_payment', verifyToken, async (req, res) => {
  try {
    const Model = getDynamicModel('subscription_payments');
    const data = await Model.find({ schoolId: req.params.uid, ...req.query }).sort({ timestamp: -1 });
    
    const formattedData = data.map(d => ({ id: d.docId || d._id.toString(), ...d._doc }));
    res.json(formattedData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 🟢 15. AUTOMATIC NOTIFICATIONS (EXPIRY & DUES)
// ==========================================
setInterval(async () => {
  try {
    const now = Date.now();
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

    // 1. Subscription Expiry Check (3 Days Warning for Admins)
    const schools = await School.find({ role: 'admin' });
    for (let school of schools) {
      if (school.end_date) {
        let expiryTime = new Date(school.end_date).getTime();
        let timeLeft = expiryTime - now;
        
        // If exactly between 2 to 3 days left
        if (timeLeft > (threeDaysMs - 86400000) && timeLeft <= threeDaysMs) {
          sendPushNotification(school.uid, "Subscription Expiring Soon ⚠️", "Your plan will expire in 3 days. Please renew to keep using all features smoothly.", "subscription");
        }
      }
    }

    // 2. Weekly Due Fees Reminder (Only on Sundays)
    if (new Date().getDay() === 0) { // 0 = Sunday
      const students = await Student.find({});
      for (let s of students) {
         if (s.dueAmount && s.dueAmount > 0) {
           let rollTopic = s.roll || (s.docId ? s.docId.replace('student_', '') : null);
           if (rollTopic) {
             sendPushNotification(rollTopic, "Fee Due Reminder 💳", `Dear ${s.name || 'Student'}, you have a pending fee of ₹${s.dueAmount}. Please clear your dues at the earliest.`, "fees");
           }
         }
      }
    }
  } catch (error) {
    console.error("Auto Notification Error:", error.message);
  }
}, 24 * 60 * 60 * 1000); // Runs once every 24 hours

// ==========================================
// 🟢 Server Start
// ==========================================
const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Master Backend Server is running on Port: ${PORT}`);
});