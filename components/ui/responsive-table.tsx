"use client";

import React from "react";

/**
 * A responsive table wrapper that renders as a normal table on desktop
 * (≥sm breakpoint) and transforms to a stacked card layout on mobile.
 *
 * Usage: wrap your existing `<table>` with this component.
 * Each `<td>` should have a `data-label` attribute whose value is the
 * column name — it will be shown as a label on mobile.
 *
 * @example
 * ```tsx
 * <ResponsiveTable>
 *   <table>
 *     <thead>
 *       <tr>
 *         <th>Name</th>
 *         <th>Role</th>
 *       </tr>
 *     </thead>
 *     <tbody>
 *       <tr>
 *         <td data-label="Name">Alice</td>
 *         <td data-label="Role">Admin</td>
 *       </tr>
 *     </tbody>
 *   </table>
 * </ResponsiveTable>
 * ```
 */
export function ResponsiveTable({ children }: { children: React.ReactNode }) {
  return <div className="responsive-table-wrapper">{children}</div>;
}