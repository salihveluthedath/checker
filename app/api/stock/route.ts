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

  if (!Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  if (body.length === 0) {
    await StockItem.deleteMany({});
    return NextResponse.json({ success: true });
  }

  const bulkOps = body.map((item: any) => {
    // Remove MongoDB internal fields to prevent duplicate key errors
    const { _id, __v, ...rest } = item;
    return {
      replaceOne: {
        filter: { id: item.id },
        replacement: rest,
        upsert: true
      }
    };
  });

  // Safely perform upserts without dropping the collection first
  await StockItem.bulkWrite(bulkOps);

  // Remove any items that are no longer in the payload
  const incomingIds = body.map((item: any) => item.id);
  await StockItem.deleteMany({ id: { $nin: incomingIds } });

  return NextResponse.json({ success: true });
}