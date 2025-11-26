# Solución de Problemas - Perfil Training

## Error: "AWS profile 'training' doesn't seem to be configured"

Este error puede ocurrir por varias razones. Aquí están las soluciones:

### Solución 1: Usar el flag directamente (Recomendado)

En lugar de usar la variable de entorno, usa el flag directamente:

```bash
cd backend
serverless deploy --aws-profile training
```

### Solución 2: Verificar que el perfil esté configurado correctamente

```bash
# Verificar que el perfil existe
aws configure list-profiles | grep training

# Verificar la configuración del perfil
aws configure list --profile training

# Verificar que puedes asumir el rol
AWS_PROFILE=training aws sts get-caller-identity
```

### Solución 3: Usar variable de entorno persistente

```bash
export AWS_PROFILE=training
cd backend
npm run deploy
```

### Solución 4: Verificar permisos del archivo de configuración

Asegúrate de que los archivos de configuración de AWS tengan los permisos correctos:

```bash
chmod 600 ~/.aws/config
chmod 600 ~/.aws/credentials
```

### Solución 5: Verificar la ruta del archivo de configuración

Serverless Framework busca la configuración en `~/.aws/config`. Verifica que el archivo existe:

```bash
cat ~/.aws/config | grep -A 10 "\[profile training\]"
```

### Solución 6: Si el perfil asume un rol

Si el perfil `training` asume un rol, asegúrate de que:

1. El `source_profile` (en este caso `default`) esté configurado correctamente
2. El `source_profile` tenga permisos para asumir el rol
3. La política de confianza del rol permita al usuario asumirlo

Verifica la configuración:
```bash
cat ~/.aws/config | grep -A 10 "\[profile training\]"
```

Debería verse algo así:
```ini
[profile training]
role_arn = arn:aws:iam::ACCOUNT:role/RoleName
source_profile = default
region = us-east-1
```

### Solución 7: Usar credenciales temporales

Si el problema persiste, puedes obtener credenciales temporales del rol y usarlas:

```bash
# Obtener credenciales temporales
AWS_PROFILE=training aws sts assume-role \
  --role-arn arn:aws:iam::080745769713:role/BP-SolutionsRole \
  --role-session-name serverless-deploy \
  --query 'Credentials' > /tmp/creds.json

# Exportar credenciales (esto es temporal, solo para esta sesión)
export AWS_ACCESS_KEY_ID=$(cat /tmp/creds.json | jq -r '.AccessKeyId')
export AWS_SECRET_ACCESS_KEY=$(cat /tmp/creds.json | jq -r '.SecretAccessKey')
export AWS_SESSION_TOKEN=$(cat /tmp/creds.json | jq -r '.SessionToken')

# Desplegar sin perfil
cd backend
npm run deploy
```

## Comando Recomendado para Desplegar

Basado en tu configuración, el comando más confiable es:

```bash
cd backend
serverless deploy --aws-profile training
```

O si prefieres usar npm:

```bash
cd backend
export AWS_PROFILE=training
npm run deploy
```

