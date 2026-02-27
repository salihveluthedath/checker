import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-8">
      <h1 className="text-4xl font-extrabold mb-8 text-gray-800">
        Deon Auto Accessories
      </h1>
      
      {/* This is the magic link to your helmets directory! */}
      <Link 
        href="/HELMET" 
        className="px-8 py-4 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 transition-transform active:scale-95"
      >
        Open Helmet Stock Dashboard
      </Link>
      
      {/* If you build other pages later, link them like this: */}
      {/* <Link href="/tank-bags">Tank Bags</Link> */}
      {/* <Link href="/crash-guards">Crash Guards</Link> */}
    </div>
  );
}