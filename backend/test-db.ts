import { AppDataSource } from './data-source';

async function testConnection() {
  try {
    console.log('Intentando conectar a DB...', process.env.DATABASE_URL?.substring(0, 30) + '...');
    await AppDataSource.initialize();
    console.log('✅ Conexión exitosa');
    await AppDataSource.destroy();
  } catch (error) {
    console.error('❌ Error de conexión:', error);
  }
}

testConnection();
