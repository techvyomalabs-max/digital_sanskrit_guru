const fs = require('fs');
const content = fs.readFileSync('f:/New folder (2)/digital sanskrit guru/my-ecommerce-app/backend/routes/orderRoutes.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('status') && (line.includes('update') || line.includes('req.body') || line.includes('save') || line.includes('find'))) {
    if (index > 800) {
      console.log(`Line ${index + 1}: ${line.trim()}`);
    }
  }
});
