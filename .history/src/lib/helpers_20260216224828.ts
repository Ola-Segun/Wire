import { Mail, MessageSquare, Hash, Phone } from 'lucide-react';
import type { Channel, Priority, Sentiment, HealthStatus } from '@/data/mockData';

export const channelIcon = (channel: Channel) => {
  switch (channel) {
    case 'email': return Mail;
    case 'slack': return Hash;
    case 'teams': return MessageSquare;
    case 'whatsapp': return Phone;
  }
};

export const priorityColor = (priority: Priority) => {
  switch (priority) {
    case 'critical': return 'bg-urgent';
    case 'high': return 'bg-primary';
    case 'medium': return 'bg-muted-foreground';
    case 'low': return 'bg-border';
  }
};

export const sentimentLabel = (sentiment: Sentiment) => {
  switch (sentiment) {
    case 'positive': return { text: 'Positive', className: 'text-success' };
    case 'neutral': return { text: 'Neutral', className: 'text-muted-foreground' };
    case 'negative': return { text: 'Frustrated', className: 'text-urgent' };
  }
};

export const healthColor = (status: HealthStatus) => {
  switch (status) {
    case 'healthy': return 'text-success';
    case 'attention': return 'text-warning';
    case 'at-risk': return 'text-urgent';
  }
};

export const healthBg = (status: HealthStatus) => {
  switch (status) {
    case 'healthy': return 'bg-success/10';
    case 'attention': return 'bg-warning/10';
    case 'at-risk': return 'bg-urgent/10';
  }
};
