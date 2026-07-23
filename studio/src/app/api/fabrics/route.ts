import { NextResponse } from 'next/server';
import { getFabricsWithColours } from '@/lib/data';

export async function GET() {
  const fabrics = await getFabricsWithColours();
  return NextResponse.json({ fabrics });
}
