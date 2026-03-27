// debug-network.js
const { execSync } = require('child_process');

async function testFetch() {
    console.log('--- 🛡️ DIAGNOSA JARINGAN VPS ---');
    
    // 1. Cek DNS resolution di OS
    console.log('\n🔍 1. Mencoba Resolusi DNS (api.replicate.com)...');
    try {
        const dig = execSync('dig +short api.replicate.com').toString();
        console.log('IP Terdeteksi:', dig.trim() || 'Gagal Resolusi!');
    } catch (e) {
        console.log('Perintah `dig` tidak ditemukan, melewati...');
    }

    // 2. Cek Koneksi OS (CURL)
    console.log('\n🔍 2. Mencoba CURL (Cek Koneksi OS)...');
    try {
        const curl = execSync('curl -Is https://api.replicate.com | head -n 1').toString();
        console.log('CURL Response:', curl.trim());
    } catch (e) {
        console.log('CURL Gagal/Timeout!');
    }

    // 3. Tes FETCH (Node.js Internal)
    console.log('\n🔍 3. Mencoba FETCH (Node.js Internal)...');
    const start = Date.now();
    try {
        const res = await fetch('https://api.replicate.com/v1/predictions', {
            method: 'POST',
            headers: { 'Authorization': 'Token dummy' },
            body: JSON.stringify({ version: "dummy", input: {} })
        });
        console.log('FETCH Berhasil! Status:', res.status);
    } catch (err) {
        console.log('FETCH GAGAL!');
        console.log('Error Name:', err.name);
        console.log('Error Message:', err.message);
        console.log('Error Cause:', err.cause ? JSON.stringify(err.cause) : 'No Cause');
    }
    console.log(`Durasi: ${Date.now() - start}ms`);

    console.log('\n--- ✅ DIAGNOSA SELESAI ---');
}

testFetch();
