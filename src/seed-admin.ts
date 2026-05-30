/**
 * Seed script — creates the first super-admin account.
 * Run: npx ts-node src/seed-admin.ts
 *
 * Uses the MONGODB_URI from .env file.
 */

import * as dotenv from 'dotenv';
import * as mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env');
  process.exit(1);
}

// User schema (minimal version for seeding)
const userSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    passwordHash: String,
    phone: String,
    role: { type: String, default: 'customer' },
    isActive: { type: Boolean, default: true },
    isPhoneVerified: { type: Boolean, default: false },
    isEmailVerified: { type: Boolean, default: false },
    addresses: { type: Array, default: [] },
    failedLoginAttempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const User = mongoose.model('User', userSchema);

async function seed() {
  // ─── Configure your admin here ─────────────────────────────────────────────
  const ADMIN_NAME = 'Super Admin';
  const ADMIN_EMAIL = 'admin@hovi.com';
  const ADMIN_PASSWORD = 'Admin@1234';
  // ───────────────────────────────────────────────────────────────────────────

  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI, { dbName: 'hovi' });
  console.log('✅ Connected to database: hovi');

  // Check if admin already exists
  const existing = await User.findOne({ email: ADMIN_EMAIL.toLowerCase() });
  if (existing) {
    console.log(`⚠️  Admin already exists: ${ADMIN_EMAIL} (role: ${existing.role})`);
    await mongoose.disconnect();
    process.exit(0);
  }

  // Create super-admin
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const admin = await User.create({
    name: ADMIN_NAME,
    email: ADMIN_EMAIL.toLowerCase(),
    passwordHash,
    role: 'super-admin',
    isActive: true,
    isEmailVerified: true,
  });

  console.log('');
  console.log('🎉 Super Admin created successfully!');
  console.log('─────────────────────────────────────');
  console.log(`   Name:     ${admin.name}`);
  console.log(`   Email:    ${admin.email}`);
  console.log(`   Password: ${ADMIN_PASSWORD}`);
  console.log(`   Role:     super-admin`);
  console.log('─────────────────────────────────────');
  console.log('');
  console.log('👉 Login at: /admin/login');
  console.log('⚠️  Change the password after first login!');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
