import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/setup-memory
 * Endpoint satu kali untuk membuat tabel memori di Supabase.
 * Panggil sekali lewat browser: https://localhost:3000/api/setup-memory
 */
export async function GET() {
  try {
    const url = process.env.projeck_url || process.env.SUPABASE_URL;
    const key = process.env.publis_key || process.env.SUPABASE_KEY;
    
    if (!url || !key) {
      return NextResponse.json({ error: "Supabase credentials not found in .env" }, { status: 500 });
    }
    
    const supabase = createClient(url, key);
    
    const results: any[] = [];
    
    // 1. Coba buat tabel response_cache
    const { error: cacheError } = await supabase.from('response_cache').select('id').limit(1);
    if (cacheError && cacheError.code === '42P01') { // Table doesn't exist
      results.push({ table: 'response_cache', status: 'NEEDS_MANUAL_CREATION', 
        sql: `CREATE TABLE response_cache (
          id bigserial PRIMARY KEY,
          prompt_hash text UNIQUE,
          prompt_text text,
          response_type text,
          response_data jsonb,
          hit_count int DEFAULT 0,
          created_at timestamptz DEFAULT now()
        );` 
      });
    } else {
      results.push({ table: 'response_cache', status: 'EXISTS' });
    }
    
    // 2. Coba buat tabel memories
    const { error: memError } = await supabase.from('memories').select('id').limit(1);
    if (memError && memError.code === '42P01') { // Table doesn't exist
      results.push({ table: 'memories', status: 'NEEDS_MANUAL_CREATION',
        sql: `CREATE TABLE memories (
          id bigserial PRIMARY KEY,
          content text,
          keywords text,
          category text DEFAULT 'general',
          created_at timestamptz DEFAULT now()
        );`
      });
    } else {
      results.push({ table: 'memories', status: 'EXISTS' });
    }

    const needsCreation = results.filter(r => r.status === 'NEEDS_MANUAL_CREATION');
    
    if (needsCreation.length > 0) {
      return NextResponse.json({
        success: false,
        message: "Tabel belum ada! Silakan jalankan SQL berikut di Supabase Dashboard > SQL Editor:",
        tables: needsCreation
      });
    }
    
    return NextResponse.json({ 
      success: true, 
      message: "All memory tables exist and ready!",
      tables: results 
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
