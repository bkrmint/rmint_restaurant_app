"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function SeedDataPage() {
  const data = useQuery(api.seedData.listAll);

  if (data === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading seed data from Convex…</p>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-destructive">Failed to load data. Is Convex running?</p>
      </div>
    );
  }

  const { chains, restaurants, dishes, menuTemplates, aiRules, ingredients } =
    data;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">
            RMint — Seed data
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Convex + Neon setup verification. Run <code className="rounded bg-muted px-1">seed:seedDatabase</code> in
            the dashboard if tables are empty.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Chains</CardTitle>
              <Badge variant="secondary">{chains.length}</Badge>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-1">
                {chains.map((c) => (
                  <li key={c._id}>
                    <span className="font-medium">{c.name}</span>{" "}
                    <span className="text-muted-foreground">({c.slug})</span>
                  </li>
                ))}
                {chains.length === 0 && (
                  <li className="text-muted-foreground">None. Run seed.</li>
                )}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Restaurants</CardTitle>
              <Badge variant="secondary">{restaurants.length}</Badge>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-1">
                {restaurants.map((r) => (
                  <li key={r._id}>
                    <span className="font-medium">{r.name}</span>{" "}
                    <span className="text-muted-foreground">({r.slug})</span>
                  </li>
                ))}
                {restaurants.length === 0 && (
                  <li className="text-muted-foreground">None. Run seed.</li>
                )}
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dishes</CardTitle>
            <Badge variant="secondary">{dishes.length}</Badge>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Cuisine</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dishes.map((d) => (
                  <TableRow key={d._id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell>{d.category}</TableCell>
                    <TableCell>{d.cuisineType}</TableCell>
                    <TableCell className="text-right">${d.basePrice}</TableCell>
                    <TableCell className="text-right">${d.costPerServing}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {dishes.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">No dishes. Run seed.</p>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Menu templates</CardTitle>
              <Badge variant="secondary">{menuTemplates.length}</Badge>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-1">
                {menuTemplates.map((m) => (
                  <li key={m._id}>
                    <span className="font-medium">{m.name}</span> — {m.cuisineType} /{" "}
                    {m.mealType}
                  </li>
                ))}
                {menuTemplates.length === 0 && (
                  <li className="text-muted-foreground">None. Run seed.</li>
                )}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">AI rules</CardTitle>
              <Badge variant="secondary">{aiRules.length}</Badge>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-1">
                {aiRules.map((r) => (
                  <li key={r._id}>
                    <span className="font-medium">{r.label}</span> — {r.ruleType}
                  </li>
                ))}
                {aiRules.length === 0 && (
                  <li className="text-muted-foreground">None. Run seed.</li>
                )}
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ingredients</CardTitle>
            <Badge variant="secondary">{ingredients.length}</Badge>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {ingredients.map((i) => (
                <Badge key={i._id} variant="outline">
                  {i.name} ({i.unit})
                </Badge>
              ))}
              {ingredients.length === 0 && (
                <p className="text-sm text-muted-foreground">None. Run seed.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
