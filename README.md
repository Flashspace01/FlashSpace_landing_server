# 🚀 Backend Deployment on Render

## Quick Deploy Steps:

1. **Go to**: https://render.com
2. **Sign Up/Login**
3. **Click**: "New +" → "Web Service"
4. **Connect**: Your GitHub repository
5. **Configure**:
   - Root Directory: `backend`
   - Build Command: `npm install`
   - Start Command: `npm start`
6. **Add Environment Variable**:
   - Key: `RESEND_API_KEY`
   - Value: Your actual Resend API key
7. **Deploy**: Click "Create Web Service"

## Your Backend URL:
After deployment, you'll get a URL like:
`https://flashspace-backend-xxxxx.onrender.com`

**Save this URL!** You'll need it for frontend configuration.

## Test Backend:
```bash
curl https://your-backend-url.onrender.com/api/health
```

Expected response:
```json
{
  "status": "ok",
  "message": "FlashSpace Backend API is running",
  "emailService": "Resend configured ✅"
}
```

---

See full documentation: [DEPLOYMENT.md](../DEPLOYMENT.md)
