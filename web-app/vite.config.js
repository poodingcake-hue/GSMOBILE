import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const handleApiRequest = (req, res, next) => {
  const parsedUrl = new URL(req.url, 'http://localhost');
  const cleanPath = parsedUrl.pathname;
  
  if ((cleanPath === '/api/save-internal' || cleanPath === '/GSMOBILE/api/save-internal') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const { date, broadcast_time, pgmTitle, location, pd, hosts, productIds } = JSON.parse(body);
        
        const date_str = date.replace(/-/g, '');
        const pgmId = `internal_${Date.now()}`;
        const csvPath = path.resolve(__dirname, 'public/data/internal.csv');
        
        // ensure directory exists
        fs.mkdirSync(path.dirname(csvPath), { recursive: true });
        
        const fileExists = fs.existsSync(csvPath);
        let writeHeader = !fileExists;
        
        if (fileExists) {
          const stats = fs.statSync(csvPath);
          if (stats.size === 0) {
            writeHeader = true;
          }
        }
        
        let csvContent = '';
        if (writeHeader) {
          csvContent += '\ufeff'; // Add UTF-8 BOM
          csvContent += 'date,date_str,broadcast_time,pgmId,pgmTitle,location,pd,hosts,prdid,title,url\n';
        }
        
        const escapeCsv = (val) => {
          if (val === null || val === undefined) return '';
          const str = String(val);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };
        
        const pgmTitleEsc = escapeCsv(pgmTitle);
        const locationEsc = escapeCsv(location);
        const pdEsc = escapeCsv(pd);
        const hostsEsc = escapeCsv(hosts);
        
        const products = productIds && productIds.length > 0 ? productIds : [''];
        products.forEach(prdid => {
          const prdidEsc = escapeCsv(prdid);
          const title = ''; // mapped dynamically in frontend
          const url = prdid ? `https://m.gsshop.com/prd/prd.gs?prdid=${prdid}` : '';
          csvContent += `${date},${date_str},${broadcast_time},${pgmId},${pgmTitleEsc},${locationEsc},${pdEsc},${hostsEsc},${prdidEsc},${title},${url}\n`;
        });
        
        fs.appendFileSync(csvPath, csvContent, 'utf8');
        
        // Git add, commit and push
        const gitCmd = `git add web-app/public/data/internal.csv && git commit -m "data: update internal schedule [skip ci]" && git push`;
        const projectRoot = path.resolve(__dirname, '..');
        
        exec(gitCmd, { cwd: projectRoot }, (error, stdout, stderr) => {
          if (error) {
            console.error(`[Git Error] ${error.message}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: true, 
              message: 'Saved locally, but Git push failed. Verify git setup.', 
              error: error.message 
            }));
          } else {
            console.log(`[Git Success] Committed and pushed internal schedule changes.`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: true, 
              message: 'Saved and pushed to GitHub successfully!' 
            }));
          }
        });
        
      } catch (err) {
        console.error(err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
  } else {
    next();
  }
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg', 'data/mlive.csv', 'data/internal.csv'],
      manifest: {
        name: 'GS Shop Mobile Live Dashboard',
        short_name: 'GSMOBILE',
        description: 'GS Shop Mobile Live Scheduling & Inventory Dashboard',
        theme_color: '#3b82f6',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'favicon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    }),
    {
      name: 'save-internal-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          handleApiRequest(req, res, next);
        });
      },
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          handleApiRequest(req, res, next);
        });
      }
    }
  ],
  base: '/GSMOBILE/',
})

