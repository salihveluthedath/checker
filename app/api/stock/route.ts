import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import StockItem from '@/models/StockItem';

// FIX 1: This stops Next.js from caching the data, so your PC and phone stay perfectly in sync.
export const dynamic = 'force-dynamic';

export async function GET() {
  await dbConnect();
  // Fetch all items
  const items = await StockItem.find({}).sort({ id: 1 });
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  await dbConnect();
  const body = await req.json();

  // FIX 2: This strips off the old "_id" tags to prevent the E11000 crash.
  const cleanedData = body.map((item: any) => {
    const { _id, __v, createdAt, updatedAt, ...cleanItem } = item;
    return cleanItem;
  });

  // Simple Sync: Delete old data and replace with new
  await StockItem.deleteMany({});
  
  // Notice we are passing "cleanedData" here instead of "body"
  await StockItem.insertMany(cleanedData);

  return NextResponse.json({ success: true });
}