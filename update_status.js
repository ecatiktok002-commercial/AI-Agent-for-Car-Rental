import fs from 'fs';
['src/pages/TicketsPage.tsx', 'src/pages/AdminDashboard.tsx', 'src/mockData.ts', 'src/types.ts'].forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/waiting_agent/g, 'waiting_assignment');
    fs.writeFileSync(file, content);
    console.log("Updated", file);
  }
});
