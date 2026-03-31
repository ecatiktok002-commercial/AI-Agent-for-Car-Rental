fetch('https://jkizfeozfgjogvhvrppz.supabase.co/rest/v1/agents?select=*', {
  headers: {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraXpmZW96Zmdqb2d2aHZycHB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MTA4MDYsImV4cCI6MjA4NzQ4NjgwNn0.KWNY7Y8IyNUwL1bTERoZnKi76kyiXqZJJXg7rZg3nn8'
  }
})
.then(r => r.json())
.then(console.log)
.catch(console.error);
