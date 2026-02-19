import mongoose from 'mongoose';

const StockItemSchema = new mongoose.Schema({
  id: Number,
  code: String,
  mrp: String,
  size: String,
  stock: Number,
  image: String, 
  originalDesc: String,
  originalPartNo: String,
  // ADD THIS FIELD
  brand: { 
    type: String, 
    enum: ['RE', 'AXXIS'], 
    default: 'RE' 
  },
}, { timestamps: true });

export default mongoose.models.StockItem || mongoose.model('StockItem', StockItemSchema);