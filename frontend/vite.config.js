import { defineConfig } from 'vite'
import fs from 'node:fs'

const https = fs.existsSync('./certs/localhost-key.pem') && fs.existsSync('./certs/localhost.pem')
  ? { key: fs.readFileSync('./certs/localhost-key.pem'), cert: fs.readFileSync('./certs/localhost.pem') }
  : undefined

export default defineConfig({ server: { host: '0.0.0.0', port: 5173, https, proxy: { '/api': 'http://127.0.0.1:8000' } } })
