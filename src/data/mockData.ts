export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type Sentiment = 'positive' | 'neutral' | 'negative';
export type Channel = 'email' | 'slack' | 'teams' | 'whatsapp';
export type HealthStatus = 'healthy' | 'attention' | 'at-risk';

export interface Client {
  id: string;
  name: string;
  company: string;
  avatar: string;
  healthScore: number;
  healthStatus: HealthStatus;
  lastContact: string;
  activeThreads: number;
  channels: Channel[];
}

export interface Message {
  id: string;
  clientId: string;
  clientName: string;
  clientAvatar: string;
  subject: string;
  preview: string;
  fullContent: string;
  channel: Channel;
  priority: Priority;
  sentiment: Sentiment;
  timestamp: string;
  isRead: boolean;
  hasActionItems: boolean;
  suggestedReply?: string;
  actionItems?: string[];
}

export interface DailyDigest {
  date: string;
  totalMessages: number;
  urgentCount: number;
  clientUpdates: { clientName: string; summary: string }[];
  actionItems: { text: string; client: string; deadline?: string }[];
}

export const clients: Client[] = [
  { id: '1', name: 'Sarah Chen', company: 'Acme Design Co', avatar: 'SC', healthScore: 92, healthStatus: 'healthy', lastContact: '2 hours ago', activeThreads: 3, channels: ['email', 'slack'] },
  { id: '2', name: 'Marcus Johnson', company: 'TechVault Inc', avatar: 'MJ', healthScore: 45, healthStatus: 'at-risk', lastContact: '12 days ago', activeThreads: 1, channels: ['email'] },
  { id: '3', name: 'Emily Rodriguez', company: 'Bright Studios', avatar: 'ER', healthScore: 78, healthStatus: 'healthy', lastContact: '1 day ago', activeThreads: 2, channels: ['slack', 'teams'] },
  { id: '4', name: 'David Kim', company: 'Nexus Labs', avatar: 'DK', healthScore: 61, healthStatus: 'attention', lastContact: '5 days ago', activeThreads: 4, channels: ['email', 'whatsapp'] },
  { id: '5', name: 'Lisa Thompson', company: 'Cloudwave', avatar: 'LT', healthScore: 88, healthStatus: 'healthy', lastContact: '3 hours ago', activeThreads: 1, channels: ['slack'] },
];

export const messages: Message[] = [
  {
    id: '1', clientId: '2', clientName: 'Marcus Johnson', clientAvatar: 'MJ',
    subject: 'Urgent: Project deadline concerns',
    preview: 'I\'m really worried about the timeline we discussed. The deliverables for Q1 are...',
    fullContent: 'I\'m really worried about the timeline we discussed. The deliverables for Q1 are not looking good and I need to understand what\'s happening with the design phase. We had agreed on having mockups ready by last Friday and I still haven\'t seen anything. Can we schedule a call ASAP?',
    channel: 'email', priority: 'critical', sentiment: 'negative',
    timestamp: '10 min ago', isRead: false, hasActionItems: true,
    suggestedReply: 'Hi Marcus, I completely understand your concerns about the timeline. I want to assure you the mockups are in final review and I\'ll have them to you by end of day tomorrow. Let me schedule a 30-min call for this afternoon to walk you through our progress and revised timeline. Would 3pm work for you?',
    actionItems: ['Schedule call with Marcus ASAP', 'Send mockup preview by EOD tomorrow', 'Revise Q1 timeline document'],
  },
  {
    id: '2', clientId: '1', clientName: 'Sarah Chen', clientAvatar: 'SC',
    subject: 'Re: Logo color preferences',
    preview: 'Love the direction! I was thinking we could go with the warm palette, specifically...',
    fullContent: 'Love the direction! I was thinking we could go with the warm palette, specifically the coral and gold combination from option B. The team really liked how it felt premium but approachable. Can you also mock up how it looks on dark backgrounds?',
    channel: 'slack', priority: 'medium', sentiment: 'positive',
    timestamp: '2 hours ago', isRead: false, hasActionItems: true,
    suggestedReply: 'Great choice, Sarah! The coral and gold combo is really striking. I\'ll have dark background mockups ready by Thursday. I\'ll also include a few variations with different opacity levels so you can see the full range.',
    actionItems: ['Create dark background logo mockups', 'Prepare opacity variations'],
  },
  {
    id: '3', clientId: '4', clientName: 'David Kim', clientAvatar: 'DK',
    subject: 'Invoice #1247 - Payment query',
    preview: 'Just checking on the invoice I received. The amount seems different from what...',
    fullContent: 'Just checking on the invoice I received. The amount seems different from what we originally discussed. Can you break down the additional charges? I want to make sure we\'re aligned before I process payment.',
    channel: 'email', priority: 'high', sentiment: 'neutral',
    timestamp: '4 hours ago', isRead: true, hasActionItems: true,
    suggestedReply: 'Hi David, thanks for flagging this. The additional charges reflect the two extra revision rounds we completed in January. I\'ll send you a detailed breakdown within the hour so everything is transparent.',
    actionItems: ['Send detailed invoice breakdown to David'],
  },
  {
    id: '4', clientId: '3', clientName: 'Emily Rodriguez', clientAvatar: 'ER',
    subject: 'Website launch - all systems go! 🚀',
    preview: 'Everything looks perfect! The team is thrilled with the final result. We\'re planning...',
    fullContent: 'Everything looks perfect! The team is thrilled with the final result. We\'re planning to launch next Tuesday. Can you make sure the SSL certificate is configured and send us the final checklist?',
    channel: 'teams', priority: 'medium', sentiment: 'positive',
    timestamp: '1 day ago', isRead: true, hasActionItems: true,
    suggestedReply: 'Wonderful news, Emily! I\'ll verify the SSL cert today and send over the pre-launch checklist by tomorrow morning. Exciting times!',
    actionItems: ['Verify SSL certificate', 'Send pre-launch checklist'],
  },
  {
    id: '5', clientId: '5', clientName: 'Lisa Thompson', clientAvatar: 'LT',
    subject: 'Quick sync on Q2 roadmap',
    preview: 'Hey! Just wanted to touch base on our Q2 plans. Are we still on track for the...',
    fullContent: 'Hey! Just wanted to touch base on our Q2 plans. Are we still on track for the feature rollout we discussed? I\'d love to get your thoughts on prioritization before our board meeting next week.',
    channel: 'slack', priority: 'low', sentiment: 'positive',
    timestamp: '3 hours ago', isRead: false, hasActionItems: false,
    suggestedReply: 'Hey Lisa! Yes, Q2 is looking solid. I\'ll put together a prioritization doc by Friday so you have it well before your board meeting. Anything specific you want me to highlight?',
  },
  {
    id: '6', clientId: '4', clientName: 'David Kim', clientAvatar: 'DK',
    subject: 'Design feedback - Homepage v3',
    preview: 'The hero section needs more work. I don\'t think the current layout conveys our...',
    fullContent: 'The hero section needs more work. I don\'t think the current layout conveys our brand message strongly enough. Can we explore bolder typography and maybe an animated background?',
    channel: 'whatsapp', priority: 'medium', sentiment: 'neutral',
    timestamp: '5 hours ago', isRead: true, hasActionItems: true,
    suggestedReply: 'Thanks for the feedback, David. I agree the hero can be stronger. I\'ll explore 2-3 bolder directions with animated elements and share by Monday.',
    actionItems: ['Create 2-3 hero section alternatives', 'Research animated background options'],
  },
];

export const dailyDigest: DailyDigest = {
  date: 'Today',
  totalMessages: 12,
  urgentCount: 2,
  clientUpdates: [
    { clientName: 'Marcus Johnson', summary: 'Expressed concern about Q1 timeline. Needs immediate follow-up.' },
    { clientName: 'Sarah Chen', summary: 'Approved logo direction (coral + gold). Requested dark background mockups.' },
    { clientName: 'Emily Rodriguez', summary: 'Website launch confirmed for next Tuesday. SSL and checklist needed.' },
    { clientName: 'David Kim', summary: 'Invoice query and homepage design feedback pending.' },
  ],
  actionItems: [
    { text: 'Schedule call with Marcus Johnson', client: 'TechVault Inc', deadline: 'Today' },
    { text: 'Send mockup previews', client: 'TechVault Inc', deadline: 'Tomorrow' },
    { text: 'Create dark background logo variants', client: 'Acme Design Co', deadline: 'Thursday' },
    { text: 'Send invoice breakdown', client: 'Nexus Labs', deadline: 'Today' },
    { text: 'Verify SSL certificate', client: 'Bright Studios', deadline: 'Monday' },
  ],
};
