import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Template from '@/models/Template';

// GET — return all templates
export async function GET() {
  await dbConnect();
  const templates = await Template.find().sort({ createdAt: -1 }).lean();
  return NextResponse.json(templates);
}

// POST — create a new template  { name, image }
export async function POST(req: NextRequest) {
  await dbConnect();
  const body = await req.json();
  const { name, image } = body;

  if (!name || !image) {
    return NextResponse.json({ error: 'name and image are required' }, { status: 400 });
  }

  const template = await Template.create({ name, image });
  return NextResponse.json(template, { status: 201 });
}
