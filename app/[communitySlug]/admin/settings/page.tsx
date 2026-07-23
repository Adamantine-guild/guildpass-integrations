"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { AdminGuard } from "@/components/admin-guard";
import { FeatureGate } from "@/components/feature-gate";
import { features } from "@/lib/features";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getApi } from "@/lib/api";
import { queryKeys } from "@/lib/query";

export default function SettingsPage() {
  const params = useParams();
  const communitySlug = (params?.communitySlug as string) || 'guildpass-demo';

  const { data: community } = useQuery({
    queryKey: queryKeys.community.all(communitySlug),
    queryFn: () => getApi(undefined, undefined, communitySlug).getCommunity(),
  });

  const [name, setName] = useState("");

  useEffect(() => {
    if (community?.name) {
      setName(community.name);
    }
  }, [community?.name]);

  return (
    <FeatureGate enabled={features.adminSettings} name="Community Settings">
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
    </FeatureGate>
  );
}
