const { Client } = require('pg');
require('dotenv').config();

async function runQuery() {
    const url = process.env.DATABASE_URL || process.argv[2];
    if (!url) {
        console.error('❌ Hata: DATABASE_URL eksik!');
        return;
    }

    const client = new Client({
        connectionString: url,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();

        // BURAYA İSTEDİĞİN SQL'İ YAZ KANZI
        const sql = "SELECT id, email, role FROM users LIMIT 10;";
        // Kendini admin yapmak için alt satırı yorumdan çıkarıp yukarıdakini silebilirsin:
        // const sql = "UPDATE users SET role = 'admin' WHERE email = 'SENIN_MAILIN@GMAIL.COM';";

        console.log('🚀 Sorgu çalıştırılıyor:', sql);
        const res = await client.query(sql);

        if (res.command === 'SELECT') {
            console.table(res.rows); // Tabloyu terminalde göreceksin!
        } else {
            console.log('✅ İşlem başarılı:', res.rowCount, 'satır etkilendi.');
        }

    } catch (err) {
        console.error('❌ Hata:', err.message);
    } finally {
        await client.end();
    }
}

runQuery();
