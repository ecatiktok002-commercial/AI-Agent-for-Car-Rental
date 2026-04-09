import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { CheckCircle2, XCircle, FileText, Clock, Calendar, MapPin, ExternalLink, User, CreditCard } from 'lucide-react';
import { Badge } from '../components/Badge';
import { BookingLead } from '../types';

export default function BookingsPage() {
  const [leads, setLeads] = useState<BookingLead[]>([]);
  const [selectedLead, setSelectedLead] = useState<BookingLead | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLeads = async () => {
      console.log("Fetching booking leads...");
      // Simplified fetch to avoid ambiguous relationship error
      const { data, error: fetchError } = await supabase
        .from('booking_leads')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (fetchError) {
        console.error("Error fetching leads:", fetchError);
        if (fetchError.code === 'PGRST116' || fetchError.message.includes('does not exist')) {
          setError("The 'booking_leads' table is missing. Please run the SQL command provided in the chat to create it.");
        } else if (fetchError.code === '42501') {
          setError("Permission Denied: You need to enable access for the 'anon' role on the 'booking_leads' table. Please run the SQL command provided in the chat.");
        } else {
          setError(fetchError.message);
        }
      } else {
        console.log("Leads fetched successfully:", data?.length);
        setLeads(data || []);
        setError(null);
      }
    };
    fetchLeads();

    const sub = supabase.channel('leads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_leads' }, fetchLeads)
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('booking_leads').update({ status }).eq('id', id);
    if (selectedLead?.id === id) {
      setSelectedLead(prev => prev ? { ...prev, status: status as any } : null);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Booking Approvals</h1>
          <p className="text-slate-500">Review customer documents and verify payments.</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
          >
            Refresh Data
          </button>
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-400"></div>
              <span className="text-slate-600">Pending</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
              <span className="text-slate-600">Confirmed</span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-3">
          <XCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Table Section */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Booking Info</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.map((lead) => (
                <tr 
                  key={lead.id} 
                  className={`hover:bg-slate-50 transition-colors cursor-pointer ${selectedLead?.id === lead.id ? 'bg-blue-50/50' : ''}`}
                  onClick={() => setSelectedLead(lead)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                        <User className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{lead.customer_phone}</p>
                        <p className="text-xs text-slate-500">Booking ID: {lead.id.slice(0, 8)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-slate-800">{lead.car_model}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-[10px] text-slate-500">
                        <Calendar className="w-3 h-3" /> {lead.rental_dates}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-slate-500">
                        <MapPin className="w-3 h-3" /> {lead.area}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={lead.status === 'confirmed' ? 'success' : lead.status === 'rejected' ? 'error' : 'warning'}>
                      {lead.status.replace('_', ' ')}
                    </Badge>
                  </td>
                </tr>
              ))}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center text-slate-400 italic">
                    No bookings found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Details Panel */}
        <div className="lg:col-span-1">
          {selectedLead ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sticky top-8 space-y-6">
              <div className="flex justify-between items-start">
                <h2 className="font-bold text-slate-900">Booking Details</h2>
                <button onClick={() => setSelectedLead(null)} className="text-slate-400 hover:text-slate-600">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-slate-50 rounded-xl space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 flex items-center gap-2"><Clock className="w-4 h-4" /> Pickup Time</span>
                    <span className="font-medium text-slate-900">{selectedLead.pickup_time || 'Not specified'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 flex items-center gap-2"><Calendar className="w-4 h-4" /> Duration</span>
                    <span className="font-medium text-slate-900">{selectedLead.duration_days ? `${selectedLead.duration_days} Days` : 'Not specified'}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Verification Documents</h3>
                  <div className="grid grid-cols-1 gap-2">
                    <DocumentLink label="Payment Receipt" url={selectedLead.receipt_url} icon={<CreditCard className="w-4 h-4" />} />
                    <DocumentLink label="Identity Card (IC)" url={selectedLead.ic_url} icon={<User className="w-4 h-4" />} />
                    <DocumentLink label="Driving License" url={selectedLead.license_url} icon={<FileText className="w-4 h-4" />} />
                  </div>
                </div>
              </div>

              {selectedLead.status === 'pending_verification' && (
                <div className="flex gap-3 pt-4 border-t border-slate-100">
                  <button 
                    onClick={() => updateStatus(selectedLead.id, 'rejected')}
                    className="flex-1 px-4 py-2.5 bg-red-50 text-red-600 rounded-xl font-semibold text-sm hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
                  >
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                  <button 
                    onClick={() => updateStatus(selectedLead.id, 'confirmed')}
                    className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-200"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Approve
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 text-sm">Select a booking from the list to view documents and approve.</p>
            </div>
          )}
        </div>
      </div>
      <div className="mt-8 pt-8 border-t border-slate-100">
        <p className="text-[10px] text-slate-300 font-mono">
          Debug: {import.meta.env.VITE_SUPABASE_URL}
        </p>
      </div>
    </div>
  );
}

function DocumentLink({ label, url, icon }: { label: string, url?: string, icon: React.ReactNode }) {
  if (!url) {
    return (
      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl opacity-50">
        <div className="flex items-center gap-3 text-sm text-slate-400 italic">
          {icon} {label}
        </div>
        <span className="text-[10px] text-slate-400">Missing</span>
      </div>
    );
  }

  return (
    <a 
      href={url} 
      target="_blank" 
      rel="noopener noreferrer"
      className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-all group"
    >
      <div className="flex items-center gap-3 text-sm font-medium text-slate-700">
        <div className="text-slate-400 group-hover:text-blue-500 transition-colors">{icon}</div>
        {label}
      </div>
      <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
    </a>
  );
}
