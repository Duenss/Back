/**
 * Script para hashear passwords de usuarios existentes en AppUsers
 * Ejecutar con: node scripts/hash_existing_passwords.js
 * 
 * IMPORTANTE: Este script modifica la base de datos. Hacer backup antes de ejecutar.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Conectar a MongoDB
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_LOCAL_URI;

if (!MONGODB_URI) {
  console.error('❌ Error: MONGODB_URI no está configurado en .env');
  process.exit(1);
}

// Definir esquema básico sin validaciones ni hooks
const appUserSchema = new mongoose.Schema({
  username: String,
  password: String,
  appId: mongoose.Schema.Types.ObjectId,
  // ... otros campos
}, { strict: false });

const AppUser = mongoose.model('AppUser', appUserSchema);

async function hashExistingPasswords() {
  try {
    console.log('🔌 Conectando a MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB\n');

    // Obtener todos los usuarios
    const users = await AppUser.find({}).select('+password');
    console.log(`📊 Total de usuarios encontrados: ${users.length}\n`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;

    for (const user of users) {
      try {
        // Verificar si el password ya está hasheado
        // Los hashes de bcrypt siempre empiezan con "$2a$", "$2b$" o "$2y$"
        if (user.password && user.password.startsWith('$2')) {
          console.log(`⏭️  Usuario "${user.username}" - password ya hasheado, saltando...`);
          skipped++;
          continue;
        }

        if (!user.password || user.password.length === 0) {
          console.log(`⚠️  Usuario "${user.username}" - password vacío, saltando...`);
          skipped++;
          continue;
        }

        // Hashear el password
        const plainPassword = user.password;
        const hashedPassword = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);

        // Actualizar directamente en la BD sin pasar por hooks de Mongoose
        await AppUser.updateOne(
          { _id: user._id },
          { $set: { password: hashedPassword } }
        );

        console.log(`✅ Usuario "${user.username}" - password hasheado correctamente`);
        updated++;

      } catch (err) {
        console.error(`❌ Error al procesar usuario "${user.username}":`, err.message);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📈 RESUMEN:');
    console.log(`   ✅ Actualizados: ${updated}`);
    console.log(`   ⏭️  Saltados: ${skipped}`);
    console.log(`   ❌ Errores: ${errors}`);
    console.log('='.repeat(60) + '\n');

    if (updated > 0) {
      console.log('🎉 Passwords hasheados correctamente.');
      console.log('💡 Ahora los usuarios pueden hacer login con su contraseña original.');
    }

  } catch (err) {
    console.error('❌ Error fatal:', err);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB');
    process.exit(0);
  }
}

// Ejecutar
console.log('🔐 SCRIPT: Hashear passwords existentes en AppUsers');
console.log('='.repeat(60) + '\n');

hashExistingPasswords();
