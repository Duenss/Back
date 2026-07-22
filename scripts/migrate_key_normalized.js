const mongoose = require('mongoose');
require('dotenv').config();
const License = require('../src/models/License');
const connectDB = require('../src/config/database');

async function migrate() {
  await connectDB();
  try {
    const licenses = await License.find({});
    console.log(`Found ${licenses.length} licenses`);
    let updated = 0;
    for (const lic of licenses) {
      const normalized = lic.key ? String(lic.key).toUpperCase() : null;
      if (!lic.keyNormalized || lic.keyNormalized !== normalized) {
        lic.keyNormalized = normalized;
        await lic.save();
        updated++;
      }
    }
    console.log(`Updated ${updated} licenses.`);
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    mongoose.connection.close();
  }
}

migrate();
