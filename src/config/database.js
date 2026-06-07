const mongoose = require('mongoose');

const connectDB = async () => {
  // Allow using a local MongoDB URI in development to avoid touching production Atlas credentials.
  // Set USE_LOCAL_DB=true and MONGODB_LOCAL_URI in Back-main/.env to enable.
  const useLocal = String(process.env.USE_LOCAL_DB || '').toLowerCase() === 'true';
  const localUri = process.env.MONGODB_LOCAL_URI;
  const atlasUri = process.env.MONGODB_URI;

  const shouldUseLocal = useLocal && Boolean(localUri);

  const targetUri = shouldUseLocal ? localUri : atlasUri;

  if (!targetUri || targetUri.includes('user:password@cluster')) {
    console.warn('⚠️  MongoDB URI not configured. Edit Back-main/.env with your MongoDB URI.');
    console.warn('   For local development set USE_LOCAL_DB=true and MONGODB_LOCAL_URI=mongodb://localhost:27017/authplatform');
    return;
  }

  try {
    const conn = await mongoose.connect(targetUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host} (using ${shouldUseLocal ? 'local' : 'atlas'} URI)`);

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
    // If Atlas SRV failed due to DNS resolution, try direct hosts as fallback
    if (!shouldUseLocal && atlasUri && atlasUri.startsWith('mongodb+srv://') && /querySrv/i.test(error.message)) {
      try {
        console.warn('SRV lookup failed; attempting direct host fallback to Atlas hosts.');
        // Fallback to known hosts if SRV resolution is not available from this environment
        const fallbackHosts = [
          'ac-izrqmta-shard-00-00.umlnbox.mongodb.net',
          'ac-izrqmta-shard-00-01.umlnbox.mongodb.net',
          'ac-izrqmta-shard-00-02.umlnbox.mongodb.net'
        ];
        const m = atlasUri.match(/^mongodb\+srv:\/\/(.*?):(.*?)@(.*)\/(.*)\?/);
        let user = null; let pass = null;
        if (m) { user = m[1]; pass = m[2]; }
        for (const host of fallbackHosts) {
          try {
            const direct = `mongodb://${user}:${encodeURIComponent(pass)}@${host}:27017/${process.env.MONGODB_DB || 'authplatform'}?ssl=true&authSource=admin&retryWrites=true&w=majority`;
            console.log('Trying fallback host', host);
            const conn2 = await mongoose.connect(direct, { serverSelectionTimeoutMS: 5000, socketTimeoutMS: 45000 });
            console.log(`✅ MongoDB Connected (fallback): ${conn2.connection.host}`);
            return;
          } catch (e) {
            console.warn('Direct connect to', host, 'failed:', e.message);
          }
        }
      } catch (e) {
        console.warn('Direct host fallback failed:', e.message);
      }
    }

    console.warn('   The API will run but database operations will fail.');
    console.warn('   Update MONGODB_URI in backend/.env to fix this.');
  }
};

module.exports = connectDB;
