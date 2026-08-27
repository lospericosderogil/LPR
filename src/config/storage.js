require('dotenv').config();

const storageConfig = {
    baseUrl: process.env.SUPABASE_URL,
    bucket: 'multimedia-aves',

    getPublicUrl: (fileName) => {
        return `${storageConfig.baseUrl}/storage/v1/object/public/${storageConfig.bucket}/${fileName}`;
    },

    uploadToSupabase: async (file) => {
        if (!file) return null;
        
        const isSupabaseConfigured = process.env.SUPABASE_URL && 
                                    !process.env.SUPABASE_URL.includes('your-project') &&
                                    process.env.SUPABASE_KEY && 
                                    !process.env.SUPABASE_KEY.includes('your-supabase');

        const fileName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`;

        if (!isSupabaseConfigured) {
            const fs = require('fs');
            const path = require('path');
            const uploadsDir = path.join(__dirname, '../../uploads');
            if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
            }
            const destPath = path.join(uploadsDir, fileName);
            if (file.buffer) {
                fs.writeFileSync(destPath, file.buffer);
            } else {
                fs.copyFileSync(file.path, destPath);
            }
            console.log(`ℹ Local storage fallback: Imagen guardada localmente en ${destPath}`);
            return `/uploads/${fileName}`;
        }
        
        const url = `${storageConfig.baseUrl}/storage/v1/object/${storageConfig.bucket}/${fileName}`;
        
        let bodyContent;
        if (file.buffer) {
            bodyContent = file.buffer;
        } else {
            const fs = require('fs');
            bodyContent = fs.readFileSync(file.path);
        }

        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
                'apikey': process.env.SUPABASE_KEY,
                'Content-Type': file.mimetype
            },
            body: bodyContent
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Error subiendo imagen a Supabase Storage: ${errText}`);
        }

        return storageConfig.getPublicUrl(fileName);
    }
};

module.exports = storageConfig;
