import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import StockItem from '@/models/StockItem';

export async function GET() {
  await dbConnect();
  // Fetch all items
  const items = await StockItem.find({}).sort({ id: 1 });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  await dbConnect();
  const body = await req.json();

  // Simple Sync: Delete old data and replace with new (easiest for stock lists)
  // Ideally, we would upsert, but for your specific excel usage, this ensures exact match.
  await StockItem.deleteMany({});
  await StockItem.insertMany(body);

  return NextResponse.json({ success: true });
}