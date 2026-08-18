const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs'); // পাসওয়ার্ড সিকিউর করার জন্য
const crypto = require('crypto'); // গভমেন্ট আইডি এনক্রিপ্ট করার জন্য

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB ক্লাউড কানেকশন
mongoose.connect('mongodb+srv://robiul926sk_db_user:X35cF8uk3qXGabH8@cluster0.axgj0zh.mongodb.net/greenland_school_db?appName=Cluster0')
  .then(() => console.log("✅ MongoDB Cloud Connected Successfully!"))
  .catch((err) => console.log("❌ DB Connection Error:", err));
// ==========================================
// 🔐 সিকিউরিটি ফাংশন (Encryption & Decryption)
// ==========================================
const ENCRYPTION_KEY = crypto.randomBytes(32); // প্রোডাকশনে এটি .env ফাইলে ফিক্সড 32 byte key রাখবেন
const IV_LENGTH = 16;

function encryptData(text) {
  if (!text) return text;
  let iv = crypto.randomBytes(IV_LENGTH);
  let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptData(text) {
  if (!text) return text;
  let textParts = text.split(':');
  let iv = Buffer.from(textParts.shift(), 'hex');
  let encryptedText = Buffer.from(textParts.join(':'), 'hex');
  let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

// ==========================================
// ১. ডেটাবেস মডেল (Schema) - School, Teacher, Student
// ==========================================

// 🏫 School/Admin Schema
const schoolSchema = new mongoose.Schema({
  schoolId: { type: String, required: true, unique: true }, // অ্যাডমিনের লগইন আইডি
  schoolName: String,
  email: String,
  password: { type: String, required: true }, // এটি Hashed থাকবে
  currentPlan: { type: String, default: "7 Days Ads Plan" },
  createdAt: { type: Date, default: Date.now }
});
const School = mongoose.model('School', schoolSchema);

// 👨‍🏫 Teacher Schema
const teacherSchema = new mongoose.Schema({
  schoolId: { type: String, required: true }, // কোন স্কুলের টিচার
  teacherId: { type: String, required: true }, // টিচারের লগইন আইডি
  name: String,
  password: { type: String, required: true }, // Hashed
  subject: String,
  govIdNumber: String, // এনক্রিপ্ট করা থাকবে
  loginEnabled: { type: Boolean, default: true }
});
const Teacher = mongoose.model('Teacher', teacherSchema);

// 🎓 Student Schema
const studentSchema = new mongoose.Schema({
  schoolId: { type: String, required: true }, // কোন স্কুলের স্টুডেন্ট
  rollNo: { type: String, required: true }, // স্টুডেন্টের লগইন আইডি
  name: String,
  className: String,
  password: { type: String, required: true }, // Hashed
  govIdType: String,
  govIdNumber: String, // 🔐 এনক্রিপ্ট করা থাকবে (যেমন: [Aadhaar Redacted])
  loginEnabled: { type: Boolean, default: true }
});
const Student = mongoose.model('Student', studentSchema);

// ==========================================
// ২. API Routes (Registration & Login)
// ==========================================

// 🟢 Admin Registration
app.post('/api/admin/register', async (req, res) => {
  try {
    const { schoolId, schoolName, email, password } = req.body;
    
    // চেক করা আইডি আগে থেকেই আছে কি না
    const existingSchool = await School.findOne({ schoolId });
    if (existingSchool) return res.status(400).json({ error: "School ID already exists!" });

    // পাসওয়ার্ড সিকিউর (Hash) করা
    const hashedPassword = await bcrypt.hash(password, 10);

    const newSchool = new School({ schoolId, schoolName, email, password: hashedPassword });
    await newSchool.save();
    
    res.json({ success: true, message: "Admin registered successfully!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🟢 Student Registration (Admin বা Teacher অ্যাড করবে)
app.post('/api/students/add', async (req, res) => {
  try {
    const { schoolId, rollNo, name, className, password, govIdType, govIdNumber } = req.body;

    const hashedPassword = await bcrypt.hash(password || "123456", 10); // ডিফল্ট 123456
    const encryptedGovId = encryptData(govIdNumber); // 🔐 আইডি সিকিউর করা হলো

    const newStudent = new Student({
      schoolId, rollNo, name, className, password: hashedPassword, govIdType, govIdNumber: encryptedGovId
    });

    await newStudent.save();
    res.json({ success: true, message: "Student added successfully!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🔵 MASTER LOGIN API (Admin, Teacher, Student)
app.post('/api/login', async (req, res) => {
  try {
    const { role, schoolId, userId, password } = req.body;

    // ১. অ্যাডমিন লগইন
    if (role === "admin") {
      const school = await School.findOne({ schoolId: userId }); // অ্যাডমিনের ক্ষেত্রে schoolId টাই userId
      if (!school) return res.status(404).json({ error: "Admin ID not found!" });

      const isMatch = await bcrypt.compare(password, school.password);
      if (!isMatch) return res.status(400).json({ error: "Invalid Password!" });

      return res.json({ success: true, message: "Admin Login Success", data: { schoolId: school.schoolId, name: school.schoolName } });
    }

    // ২. স্টুডেন্ট বা টিচার লগইন (আগে চেক করবে স্কুলটা আদৌ আছে কি না)
    const schoolExists = await School.findOne({ schoolId });
    if (!schoolExists) return res.status(404).json({ error: "School ID is invalid!" });

    if (role === "student") {
      const student = await Student.findOne({ schoolId, rollNo: userId });
      if (!student) return res.status(404).json({ error: "Student ID not found in this school!" });
      if (!student.loginEnabled) return res.status(403).json({ error: "Your login is disabled by Admin." });

      const isMatch = await bcrypt.compare(password, student.password);
      if (!isMatch) return res.status(400).json({ error: "Invalid Password!" });

      return res.json({ success: true, message: "Student Login Success", data: { rollNo: student.rollNo, name: student.name } });
    }

    if (role === "teacher") {
      const teacher = await Teacher.findOne({ schoolId, teacherId: userId });
      if (!teacher) return res.status(404).json({ error: "Teacher ID not found in this school!" });
      if (!teacher.loginEnabled) return res.status(403).json({ error: "Your login is disabled by Admin." });

      const isMatch = await bcrypt.compare(password, teacher.password);
      if (!isMatch) return res.status(400).json({ error: "Invalid Password!" });

      return res.json({ success: true, message: "Teacher Login Success", data: { teacherId: teacher.teacherId, name: teacher.name } });
    }

    res.status(400).json({ error: "Invalid Role!" });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// সার্ভার স্টার্ট
const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server is running on Port: ${PORT}`);
});