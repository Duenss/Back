# 🚀 Guía de Deployment a AWS Elastic Beanstalk

## Requisitos Previos
- Cuenta AWS activa
- AWS CLI instalado: https://aws.amazon.com/cli/
- Git instalado
- Variables de entorno configuradas en `.env.production`

## Paso 1: Preparar el Proyecto
```bash
# Asegurate de estar en la carpeta back-aws
cd back-aws

# Verificar que package.json existe
npm install

# Prueba local
npm run dev
```

## Paso 2: Instalar EB CLI
```bash
pip install awsebcli --upgrade --user
```

## Paso 3: Inicializar Elastic Beanstalk
```bash
# Crear la configuración de EB
eb init -p "Node.js 18 running on 64bit Amazon Linux 2" authplatform-backend --region us-east-1

# O configurar manualmente en AWS Console
```

## Paso 4: Crear Ambiente
```bash
# Crear el ambiente (primera vez)
eb create authplatform-prod --instance-type t3.micro --envvars BCRYPT_ROUNDS=10,CORS_ORIGIN=https://auchrd.netlify.app,JWT_EXPIRES_IN=7d,JWT_SECRET=authplatform-super-secret-jwt-key-2024-dev,MONGODB_URI=mongodb+srv://JvampaRD:70954408@authclus.umlnbox.mongodb.net/authplatform,NODE_ENV=production,RATE_LIMIT_MAX=100,RATE_LIMIT_WINDOW_MS=900000

# O usar eb setenv después de crear
```

## Paso 5: Desplegar
```bash
# Desplegar el código
eb deploy authplatform-prod

# Ver logs en tiempo real
eb logs -f

# Ver estado
eb status
```

## Paso 6: Obtener URL de la Aplicación
```bash
eb open
```

La URL será algo como: `http://authplatform-prod.us-east-1.elasticbeanstalk.com`

## Variables de Entorno Configuradas
- BCRYPT_ROUNDS: 10
- CORS_ORIGIN: https://auchrd.netlify.app
- JWT_EXPIRES_IN: 7d
- JWT_SECRET: (secreto)
- MONGODB_URI: (URI de MongoDB Atlas)
- NODE_ENV: production
- RATE_LIMIT_MAX: 100
- RATE_LIMIT_WINDOW_MS: 900000

## Monitoreo
```bash
# Ver logs
eb logs

# Abrir dashboard AWS
eb open --console

# SSH a la instancia (si es necesario)
eb ssh authplatform-prod
```

## Troubleshooting

### La app no inicia
```bash
# Ver detalles de error
eb logs -f -all

# Revisar que MongoDB sea accesible desde AWS
# En MongoDB Atlas, agregar IP 0.0.0.0/0 a whitelist (temporal)
```

### Versión de Node incorrecta
```bash
# Editar .ebextensions/nodejs.config
# Cambiar la versión en platform
```

### Performance lento
```bash
# Aumentar instancia a t3.small
eb scale 2

# O escalar manualmente en AWS Console
```

## Actualizar después de cambios
```bash
# Hacer cambios locales
git add .
git commit -m "Update backend"

# Desplegar
eb deploy
```

## Rollback a versión anterior
```bash
eb appversion --list
eb deploy --version v1
```

## Costos
- t3.micro: ~$5-8/mes (dentro del free tier primer año)
- MongoDB Atlas M0: Gratis
- Total estimado: ~$10-15/mes después del año gratis

¡Deployado exitosamente! 🎉
