import React, { useState, useEffect } from 'react';
import { 
  Users, 
  MessageSquare, 
  Clock, 
  CheckCircle2,
  ArrowUpRight,
  MoreHorizontal,
  BookOpen
} from 'lucide-react';
import { Badge } from '../components/Badge';
import { cn } from '../utils';
import { supabase } from '../supabase';
import { Ticket } from '../types';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AdminDashboard() {
  const { agent } = useAuth();
  const [stats, setStats] = useState({
    total: 0,
    aiHandling: 0,
    currentLoad: 0,
    knowledgeFacts: 0
  });
  const [recentTickets, setRecentTickets] = useState<Ticket[]>([]);
  const [ticketFilter, setTicketFilter] = useState<'mine' | 'all'>('mine');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      // 1. Fetch Counts
      const { count: total } = await supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('is_deleted', false);
      const { count: aiHandling } = await supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('status', 'ai_handling').eq('is_deleted', false);
      const { count: currentLoad } = await supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('status', 'assigned').eq('is_deleted', false);
      const { count: knowledgeFacts } = await supabase.from('company_knowledge').select('*', { count: 'exact', head: true });

      setStats({
        total: total || 0,
        aiHandling: aiHandling || 0,
        currentLoad: currentLoad || 0,
        knowledgeFacts: knowledgeFacts || 0
      });

      // 2. Fetch Recent Tickets
      let query = supabase
        .from('tickets')
        .select(`
          *, 
          customer:customers(*), 
          assigned_agent:agents(*),
          messages(created_at)
        `)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .order('created_at', { foreignTable: 'messages', ascending: false })
        .limit(1, { foreignTable: 'messages' })
        .limit(5);

      if (ticketFilter === 'mine' && agent) {
        query = query.eq('assigned_agent_id', agent.id);
      }

      const { data: tickets } = await query;

      // Process and sort by latest activity
      const processedTickets = (tickets || []).map(ticket => {
        const latestMessage = (ticket.messages as any[])?.[0];
        return {
          ...ticket,
          last_activity_at: latestMessage?.created_at || ticket.created_at
        };
      });

      processedTickets.sort((a: any, b: any) => 
        new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime()
      );

      setRecentTickets(processedTickets);
      setLoading(false);
    };

    fetchDashboardData();

    // Real-time subscription for dashboard updates
    const subscription = supabase
      .channel('public:tickets_dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        fetchDashboardData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [ticketFilter, agent]);

  const statCards = [
    { label: 'Total Tickets', value: stats.total, icon: MessageSquare, trend: 'Live', color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'AI Handling', value: stats.aiHandling, icon: CheckCircle2, trend: 'Live', color: 'text-violet-600', bg: 'bg-violet-50' },
    { label: 'Knowledge Base', value: stats.knowledgeFacts, icon: BookOpen, trend: 'Facts', color: 'text-amber-600', bg: 'bg-amber-50', link: '/admin/knowledge-base' },
  ];

  if (loading) {
    return <div className="p-8 text-center text-slate-400">Loading dashboard...</div>;
  }

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard Overview</h1>
        <p className="text-slate-500">Welcome back, here's what's happening today.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {statCards.map((stat) => (
          <Link 
            key={stat.label} 
            to={stat.link || '#'}
            className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow group"
          >
            <div className="flex justify-between items-start mb-4">
              <div className={cn("p-2 rounded-xl", stat.bg)}>
                <stat.icon className={cn("w-5 h-5", stat.color)} />
              </div>
              <span className={cn(
                "text-xs font-medium px-2 py-1 rounded-full",
                stat.label === 'Knowledge Base' ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"
              )}>
                {stat.trend}
              </span>
            </div>
            <p className="text-sm font-medium text-slate-500">{stat.label}</p>
            <div className="flex items-end justify-between">
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</h3>
              {stat.link && <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-black transition-colors" />}
            </div>
          </Link>
        ))}
      </div>

      {/* Recent Tickets Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-slate-900">Recent Tickets</h2>
            <div className="flex p-1 bg-slate-100 rounded-xl">
              <button
                onClick={() => setTicketFilter('mine')}
                className={cn(
                  "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                  ticketFilter === 'mine' 
                    ? "bg-white text-slate-900 shadow-sm" 
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                My Tickets
              </button>
              <button
                onClick={() => setTicketFilter('all')}
                className={cn(
                  "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                  ticketFilter === 'all' 
                    ? "bg-white text-slate-900 shadow-sm" 
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                All Tickets
              </button>
            </div>
          </div>
          <Link to="/admin/tickets" className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1">
            View all <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Agent</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Tag</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Created</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentTickets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400 text-sm">No tickets found</td>
                </tr>
              ) : (
                recentTickets.map((ticket) => (
                  <tr key={ticket.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{ticket.customer?.name || 'Unknown'}</p>
                        <p className="text-xs text-slate-500">{ticket.customer?.phone_number}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={
                        ticket.status === 'ai_handling' ? 'ai' : 
                        ticket.status === 'waiting_agent' ? 'warning' : 'success'
                      }>
                        {ticket.status === 'ai_handling' 
                          ? `AI ${ticket.assigned_agent?.name?.split(' ')[0] || 'Agent'}` 
                          : ticket.status === 'waiting_agent'
                            ? `Waiting for ${ticket.assigned_agent?.name?.split(' ')[0] || 'Agent'}`
                            : `Agent ${ticket.assigned_agent?.name?.split(' ')[0] || 'Agent'}`}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-600">{ticket.assigned_agent?.name || 'Unassigned'}</span>
                    </td>
                    <td className="px-6 py-4">
                      {ticket.tag && <Badge variant="info">{ticket.tag}</Badge>}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {new Date(ticket.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                        <MoreHorizontal className="w-4 h-4 text-slate-400" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
