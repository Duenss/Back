# 🚀 AuthPlatform Backend - AWS Deployment Ready

Este directorio contiene el código del backend completamente preparado para deployment en AWS Elastic Beanstalk.

## ✅ Configuración incluida:

- ✅ `.env.production` - Variables de entorno para producción
- ✅ `.ebignore` - Archivos a ignorar en AWS
- ✅ `.ebextensions/nodejs.config` - Configuración de Elastic Beanstalk
- ✅ `Dockerfile` - Docker para deployment
- ✅ `AWS_DEPLOYMENT.md` - Guía detallada de deployment
- ✅ MongoDB Atlas conectado
- ✅ CORS configurado para `https://auchrd.netlify.app`

## 🚀 Deployment rápido (10 minutos)

### Opción 1: AWS Elastic Beanstalk CLI (Recomendado)

```bash
# 1. Instalar EB CLI
pip install awsebcli --upgrade --user

# 2. Inicializar (primera vez)
eb init -p "Node.js 18 running on 64bit Amazon Linux 2" authplatform-backend --region us-east-1

# 3. Crear ambiente
eb create authplatform-prod --instance-type t3.micro

# 4. Desplegar
eb deploy

# 5. Abrir en navegador
eb open
```

### Opción 2: AWS Console (Manual)

1. Ve a [AWS Elastic Beanstalk](https://console.aws.amazon.com/elasticbeanstalk)
2. Click en "Create Application"
3. Nombre: `authplatform-backend`
4. Platform: Node.js 18
5. Upload code: Comprime esta carpeta como `back-aws.zip`
6. Configura variables de entorno manualmente
7. Deploy

## 📋 Variables de Entorno Preconfiguradas

```
BCRYPT_ROUNDS=10
CORS_ORIGIN=https://auchrd.netlify.app
JWT_EXPIRES_IN=7d
JWT_SECRET=authplatform-super-secret-jwt-key-2024-dev
MONGODB_URI=mongodb+srv://JvampaRD:70954408@authclus.umlnbox.mongodb.net/authplatform
NODE_ENV=production
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=900000
```

## 📝 Scripts disponibles

```bash
npm start    # Inicia el servidor en producción
npm run dev  # Inicia con nodemon (desarrollo)
npm install  # Instala dependencias
```

## 🔍 Verificar que funciona

Después de deployar, visita:
```
https://tu-app.us-east-1.elasticbeanstalk.com/health
```

Deberías ver:
```json
{
  "success": true,
  "message": "AuthPlatform API is running",
  "environment": "production"
}
```

## 🔗 Actualizar Frontend

En tu frontend (`frontend/.env.local`):
```
NEXT_PUBLIC_API_URL=https://tu-app.us-east-1.elasticbeanstalk.com/api
```

## 💾 Estructura de carpetas

```
back-aws/
├── .env.production          # ← Variables de entorno
├── .ebignore                # ← Archivos ignorados en AWS
├── .ebextensions/           # ← Configuración de EB
├── Dockerfile               # ← Para Docker
├── package.json             # ← Dependencias
├── src/
│   ├── server.js           # ← Entrada principal
│   ├── config/             # ← Configuración (DB, etc)
│   ├── routes/             # ← Endpoints API
│   ├── controllers/        # ← Lógica de negocio
│   ├── middleware/         # ← Rate limit, CORS, etc
│   ├── models/             # ← Esquemas MongoDB
│   └── utils/              # ← Utilidades
└── AWS_DEPLOYMENT.md       # ← Guía completa
```

## ⚡ Performance & Seguridad

- ✅ Helmet.js activado (headers de seguridad)
- ✅ Rate limiting: 100 requests por 15 minutos
- ✅ CORS restringido a dominio específico
- ✅ Validación de entrada con express-validator
- ✅ Logging de seguridad activado
- ✅ MongoDB connection pool configurado

## 📊 Monitoreo en AWS

```bash
# Ver logs en tiempo real
eb logs -f

# Ver estado de la aplicación
eb status

# SSH a la instancia (si es necesario)
eb ssh authplatform-prod
```

## 🆘 Troubleshooting

**P: La aplicación no inicia**
R: Ejecuta `eb logs -f -all` para ver los errores detallados

**P: MongoDB no responde**
R: En MongoDB Atlas, agrega la IP de AWS a whitelist (o 0.0.0.0/0 temporalmente)

**P: CORS bloqueando peticiones**
R: Verifica que `CORS_ORIGIN` sea exacto (incluyendo https://)

**P: Performance lenta**
R: Sube a instancia t3.small o activa auto-scaling

## 📞 Soporte

Para más detalles, ver [AWS_DEPLOYMENT.md](./AWS_DEPLOYMENT.md)

---

**¡Listo para deployar!** 🎉
