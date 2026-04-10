import dotenv from "dotenv";
dotenv.config();
console.log(process.env.GEMINI_API_KEY ? "Key is set" : "Key is NOT set");
console.log(process.env.GEMINI_BACKUP_KEY ? "Backup key is set" : "Backup key is NOT set");
