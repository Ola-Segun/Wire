"use client";

import React, { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { DollarSign, Users, Bell, Settings } from "lucide-react";

export default function BentoPlayground() {
  const [date, setDate] = useState<Date | undefined>(new Date());
  
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">UI Components Playground</h1>
          <p className="text-muted-foreground mt-2">
            A separate workspace using a Bento Grid layout to experiment with available UI components.
          </p>
        </div>

        {/* Bento Grid Container */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 auto-rows-[minmax(180px,auto)]">
          
          {/* Card 1: Stats / Overview (2 cols, 1 row) */}
          <Card className="md:col-span-2 shadow-sm flex flex-col justify-between overflow-hidden relative">
            <CardHeader className="pb-2">
              <CardDescription>Total Revenue</CardDescription>
              <CardTitle className="text-4xl">$45,231.89</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">+20.1% from last month</p>
              <div className="h-4 mt-4">
                <Progress value={65} className="h-2" />
              </div>
            </CardContent>
            <div className="absolute top-6 right-6 text-slate-200 dark:text-slate-800">
              <DollarSign className="w-24 h-24 -mr-4 -mt-4 opacity-50" />
            </div>
          </Card>

          {/* Card 2: Quick Action Profile (1 col, 1 row) */}
          <Card className="shadow-sm flex flex-col items-center justify-center p-6 text-center">
            <Avatar className="h-16 w-16 mb-4">
              <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
              <AvatarFallback>CN</AvatarFallback>
            </Avatar>
            <h3 className="font-semibold">Alex Developer</h3>
            <p className="text-sm text-muted-foreground mb-4">Standard User</p>
            <Badge variant="secondary">Pro Member</Badge>
          </Card>

          {/* Card 3: Control Panel (1 col, 2 rows) */}
          <Card className="shadow-sm md:row-span-2 flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" /> Settings
              </CardTitle>
              <CardDescription>Manage your preferences</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-6">
              <div className="flex items-center justify-between">
                <Label htmlFor="airplane-mode" className="flex flex-col space-y-1">
                  <span>Notifications</span>
                  <span className="font-normal text-xs text-muted-foreground">Receive push alerts</span>
                </Label>
                <Switch id="airplane-mode" defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="marketing" className="flex flex-col space-y-1">
                  <span>Marketing Emails</span>
                  <span className="font-normal text-xs text-muted-foreground">Weekly newsletters</span>
                </Label>
                <Switch id="marketing" />
              </div>
              <div className="space-y-3 pt-4 border-t">
                <Label>Volume Level</Label>
                <Slider defaultValue={[50]} max={100} step={1} />
              </div>
              <div className="space-y-3 pt-4 border-t">
                <Label>Quick Connect</Label>
                <div className="flex space-x-2">
                  <Input placeholder="Enter pairing code" />
                  <Button size="icon" variant="secondary">
                     <Bell className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 4: Tabs Component (2 cols, 2 rows) */}
          <Card className="md:col-span-2 md:row-span-2 shadow-sm">
            <CardHeader>
              <CardTitle>Interactive Elements</CardTitle>
              <CardDescription>Switch between different views</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="account" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="account">Account</TabsTrigger>
                  <TabsTrigger value="password">Password</TabsTrigger>
                </TabsList>
                <TabsContent value="account" className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" defaultValue="Pedro Duarte" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input id="username" defaultValue="@peduarte" />
                  </div>
                  <Button>Save changes</Button>
                </TabsContent>
                <TabsContent value="password" className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="current">Current password</Label>
                    <Input id="current" type="password" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new">New password</Label>
                    <Input id="new" type="password" />
                  </div>
                  <Button>Save password</Button>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Card 5: Calendar (1 col, 2 rows) */}
          <Card className="shadow-sm md:row-span-2 flex flex-col">
            <CardHeader>
              <CardTitle>Schedule</CardTitle>
              <CardDescription>Pick a date for action</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex items-center justify-center p-0 pb-6">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                className="rounded-md border shadow"
              />
            </CardContent>
          </Card>

          {/* Card 6: Accordion FAQ (1 col, 1 row) */}
          <Card className="shadow-sm md:col-span-3">
            <CardHeader>
              <CardTitle>Frequently Asked Questions</CardTitle>
              <CardDescription>Explore an accordion display format</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1">
                  <AccordionTrigger>Is it accessible?</AccordionTrigger>
                  <AccordionContent>
                    Yes. It adheres to the WAI-ARIA design pattern.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-2">
                  <AccordionTrigger>Is it styled?</AccordionTrigger>
                  <AccordionContent>
                    Yes. It comes with default styles that matches the other components&apos; aesthetic.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
          
        </div>
      </div>
    </div>
  );
}
