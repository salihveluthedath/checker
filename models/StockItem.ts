import mongoose from 'mongoose';

const StockItemSchema = new mongoose.Schema({
  id: Number,
  code: String,
  mrp: String,
  size: String,
  stock: Number,
  image: String, // We store the Base64 string here
  originalDesc: String,
  originalPartNo: String,
}, { timestamps: true });

export default mongoose.models.StockItem || mongoose.model('StockItem', StockItemSchema);