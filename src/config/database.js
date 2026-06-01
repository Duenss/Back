const mongoose = require('mongoose');

const connectDB = async () => {
  if (!process.env.MONGODB_URI || process.env.MONGODB_URI.includes('user:password@cluster')) {
    console.warn('⚠️  MONGODB_URI not configured. Edit backend/.env with your MongoDB Atlas URI.');
    console.warn('   Get a free cluster at: https://www.mongodb.com/atlas');
    return;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    mongoose.connection.on('error', (err) => {
      console.error(`MongoDB connection error: ${err}`);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected. Attempting to reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected');
    });
  } catch (error) {
    console.error(`❌ MongoDB connection failed: ${error.message}`);
    console.warn('   The API will run but database operations will fail.');
    console.warn('   Update MONGODB_URI in backend/.env to fix this.');
  }
};

module.exports = connectDB;
