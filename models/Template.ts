import mongoose from 'mongoose';

const TemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  image: { type: String, required: true },   // base64 data-URL
}, { timestamps: true });

export default mongoose.models.Template || mongoose.model('Template', TemplateSchema);
