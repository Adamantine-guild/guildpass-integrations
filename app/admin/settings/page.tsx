"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { AdminGuard } from "@/components/admin-guard";

export default function SettingsPage() {
  const [name, setName] = useState("GuildPass Demo Community");
  return (
    <AdminGuard>
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Community Settings</h1>
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <label htmlFor="community-name" className="text-sm font-medium">
              Community Name
            </label>
            <Input
              id="community-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled>Save</Button>
              <span className="text-xs text-muted-foreground">
                Persistence deferred for MVP.
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminGuard>
  );
}
