const { Client } = require('pg');
require('dotenv').config();

async function fixDatabase() {
    // .env'den veya terminalden gelen URL'i kullan
    let url = process.env.DATABASE_URL || process.argv[2];

    if (!url) {
        console.error('❌ Hata: DATABASE_URL bulunamadı!');
        console.log('Kullanım: node fix-db.js "POSTGRES_DIŞ_BAĞLANTI_URLİNİZ"');
        console.log('\nRailway Dashboard\'da PostgreSQL servisine tıkla.');
        console.log('Connect sekmesine gel ve "External Connection String" yazan yeri kopyala.');
        console.log('Sonra şu şekilde çalıştır: node fix-db.js "kopyaladığın_url"');
        return;
    }

    console.log('🔄 Veritabanına bağlanılıyor...');

    const client = new Client({
        connectionString: url,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('✅ Bağlantı başarılı.');

        console.log('🚀 PostGIS eklentisi aktif ediliyor...');
        await client.query('CREATE EXTENSION IF NOT EXISTS postgis;');

        console.log('✨ Tebrikler! PostGIS başarıyla kuruldu.');
        console.log('Şimdi backend projesini Railway üzerinde "Restart" yapabilirsin.');
    } catch (err) {
        console.error('❌ Bir hata oluştu:', err.message);
    } finally {
        try { await client.end(); } catch (e) { }
    }
}

fixDatabase();
