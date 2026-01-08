import mongoose from 'mongoose';

// 1. DEFINE CACHED VARIABLE OUTSIDE (Global Scope)
// Do NOT put the MONGODB_URI check here. It will crash the build.
let cached = (global as any).mongoose;

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

async function dbConnect() {
  // 2. CHECK FOR PASSWORD INSIDE THE FUNCTION
  // This ensures the app is fully loaded before we look for the password.
  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    throw new Error(
      'Please define the MONGODB_URI environment variable inside .env.local'
    );
  }

  // 3. Connect to Database
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      console.log("✅ SUCCESSFULLY CONNECTED TO MONGODB!");
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default dbConnect;