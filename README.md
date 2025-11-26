# Demo de Autenticación con AWS Cognito y MFA

Este proyecto demuestra cómo implementar autenticación de usuarios usando AWS Cognito con soporte para Multi-Factor Authentication (MFA) usando códigos TOTP.

## Estructura del Proyecto

```
cognito_mfa_demo/
├── backend/          # Serverless Framework con Lambda y API Gateway
│   ├── src/
│   │   └── handlers/ # Funciones Lambda
│   ├── serverless.yml
│   └── package.json
└── frontend/         # Aplicación React
    ├── src/
    │   ├── components/
    │   ├── context/
    │   ├── services/
    │   └── config/
    └── package.json
```

## Características

- ✅ Registro de usuarios
- ✅ Inicio de sesión
- ✅ Autenticación de dos factores (MFA) con TOTP
- ✅ Configuración de MFA con código QR
- ✅ Rutas protegidas en el backend
- ✅ Protección de rutas en el frontend

## Requisitos Previos

- Node.js 18.x o superior
- AWS CLI configurado con credenciales
- Serverless Framework instalado globalmente: `npm install -g serverless`
- Cuenta de AWS con permisos para crear recursos de Cognito, Lambda y API Gateway

## Instalación y Configuración

### Backend

1. Navega al directorio del backend:
```bash
cd backend
```

2. Instala las dependencias:
```bash
npm install
```

3. Despliega la infraestructura:
```bash
npm run deploy
```

4. Después del despliegue, obtén los valores de salida:
```bash
serverless info
```

Necesitarás:
- `UserPoolId`
- `UserPoolClientId`
- `ApiGatewayRestApiId` (para construir la URL del API)

### Frontend

1. Navega al directorio del frontend:
```bash
cd frontend
```

2. Instala las dependencias:
```bash
npm install
```

3. Crea un archivo `.env` en el directorio `frontend`:
```env
REACT_APP_USER_POOL_ID=tu-user-pool-id
REACT_APP_CLIENT_ID=tu-client-id
REACT_APP_API_ENDPOINT=https://tu-api-id.execute-api.us-east-1.amazonaws.com/dev
```

4. Inicia la aplicación:
```bash
npm start
```

La aplicación se abrirá en `http://localhost:3000`

## Uso

1. **Registro**: Crea una nueva cuenta en `/signup`
2. **Login**: Inicia sesión con tus credenciales en `/login`
3. **MFA**: Si tienes MFA habilitado, se te pedirá el código después del login
4. **Configurar MFA**: En el dashboard, puedes configurar MFA escaneando el código QR con una app como Google Authenticator o Authy
5. **API Protegida**: Prueba llamar a la ruta protegida desde el dashboard

## Endpoints del API

### Públicos (sin autenticación)
- `POST /auth/signup` - Registrar nuevo usuario
- `POST /auth/login` - Iniciar sesión
- `POST /auth/verify-mfa` - Verificar código MFA

### Protegidos (requieren autenticación)
- `POST /auth/setup-mfa` - Obtener código secreto para MFA
- `POST /auth/enable-mfa` - Habilitar MFA después de verificar el código
- `GET /api/protected` - Ruta de ejemplo protegida

## Desarrollo Local

### Backend con Serverless Offline

```bash
cd backend
npm run offline
```

### Frontend

```bash
cd frontend
npm start
```

## Despliegue

### Backend
```bash
cd backend
npm run deploy
```

### Frontend
```bash
cd frontend
npm run build
# Sube la carpeta build a S3 o tu servicio de hosting preferido
```

## Notas Importantes

- El User Pool se configura con MFA opcional, lo que permite a los usuarios habilitarlo cuando lo deseen
- Las contraseñas deben cumplir con la política configurada (mínimo 8 caracteres, mayúsculas, minúsculas, números y símbolos)
- Los tokens de acceso se almacenan en localStorage (considera usar httpOnly cookies para producción)

## Solución de Problemas

1. **Error de CORS**: Asegúrate de que el endpoint del API en `.env` sea correcto
2. **Error de autenticación**: Verifica que los IDs del User Pool y Client estén correctos
3. **MFA no funciona**: Asegúrate de que el código TOTP sea de 6 dígitos y esté sincronizado

## Licencia

MIT

