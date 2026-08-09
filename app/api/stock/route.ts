import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import StockItem from '@/models/StockItem';

export async function GET(req: Request) {
  await dbConnect();
  
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');

  const skip = (page - 1) * limit;
  const items = await StockItem.find({}).sort({ id: 1 }).skip(skip).limit(limit);
  const total = await StockItem.countDocuments({});

  return NextResponse.json({
    items,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  });
}

export async function POST(req: Request) {
  await dbConnect();
  const body = await req.json();

  if (!Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  if (body.length === 0) {
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

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  await dbConnect();
  
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const brand = url.searchParams.get('brand');

  if (id) {
    await StockItem.deleteOne({ id: parseInt(id) });
  } else if (brand) {
    await StockItem.deleteMany({ brand });
  } else {
    await StockItem.deleteMany({});
  }

  return NextResponse.json({ success: true });
}