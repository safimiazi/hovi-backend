/**
 * Seed script — create a super-admin user directly in the database.
 *
 * Usage:
 *   npm run seed:admin
 *
 * This script reads MONGODB_URI from .env and upserts the super-admin account.
 * Safe to run multiple times — updates password if the user already exists.
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';

// Load .env from project root
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// ─── Config ──────────────────────────────────────────────────────────────────

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error('❌  MONGODB_URI not found in .env');
  process.exit(1);
}

const SUPER_ADMIN = {
  name: 'Mohibul Miazi',
  email: 'mohibullamiazi@gmail.com',
  password: 'Adminshafi12!@',
  role: 'super-admin',
};

// ─── Schema (minimal — mirrors user.schema.ts) ────────────────────────────────

const UserSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, lowercase: true, trim: true },
    passwordHash: String,
    role: { type: String, default: 'customer' },
    isActive: { type: Boolean, default: true },
    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },
    failedLoginAttempts: { type: Number, default: 0 },
    favoriteProducts: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    addresses: { type: Array, default: [] },
  },
  { timestamps: true, collection: 'users' },
);

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('�  Connecting to MongoDB…');
  await mongoose.connect(MONGO_URI as string);
  console.log('✅  Connected');

  const User = mongoose.model('User', UserSchema);

  const passwordHash = await bcrypt.hash(SUPER_ADMIN.password, 12);

  const existing = await User.findOne({ email: SUPER_ADMIN.email });

  if (existing) {
    await User.updateOne(
      { email: SUPER_ADMIN.email },
      {
        $set: {
          name: SUPER_ADMIN.name,
          role: SUPER_ADMIN.role,
          passwordHash,
          isActive: true,
          isEmailVerified: true,
        },
      },
    );
    console.log(`🔄  Super-admin updated: ${SUPER_ADMIN.email}`);
  } else {
    await User.create({
      name: SUPER_ADMIN.name,
      email: SUPER_ADMIN.email,
      passwordHash,
      role: SUPER_ADMIN.role,
      isActive: true,
      isEmailVerified: true,
    });
    console.log(`🎉  Super-admin created: ${SUPER_ADMIN.email}`);
  }

  console.log('');
  console.log('─────────────────────────────────────');
  console.log('  Email   :', SUPER_ADMIN.email);
  console.log('  Password: K!n3d€o@Admin#2025');
  console.log('  Role    :', SUPER_ADMIN.role);
  console.log('─────────────────────────────────────');
  console.log('');

  await mongoose.disconnect();
  console.log('🔌  Disconnected. Done.');
}

seed().catch((err) => {
  console.error('❌  Seed failed:', err);
  process.exit(1);
});
