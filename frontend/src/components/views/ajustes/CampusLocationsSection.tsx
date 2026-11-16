"use client";

import React from "react";
import { BlockTitle, List, ListItem } from "konsta/react";
import { Buildings } from "@phosphor-icons/react";

/**
 * Static informational section listing connected UNSA Arequipa campus areas.
 */
export function CampusLocationsSection(): React.JSX.Element {
  return (
    <>
      <BlockTitle>Sedes Universitarias Conectadas</BlockTitle>
      <List strong inset className="my-0">
        <ListItem
          title="Campus Ingenierias"
          subtitle="Sistemas, Civil, Minas, Industrial"
          after={
            <span className="text-ios-footnote text-ink-secondary">
              Paucarpata
            </span>
          }
          media={
            <Buildings
              size={22}
              weight="regular"
              className="text-ink-secondary"
            />
          }
        />
        <ListItem
          title="Campus Biomedicas"
          subtitle="Medicina, Enfermería, Biología"
          after={
            <span className="text-ios-footnote text-ink-secondary">
              A. Carrión
            </span>
          }
          media={
            <Buildings
              size={22}
              weight="regular"
              className="text-ink-secondary"
            />
          }
        />
        <ListItem
          title="Campus Sociales"
          subtitle="Derecho, Economía, Administración"
          after={
            <span className="text-ios-footnote text-ink-secondary">
              Venezuela
            </span>
          }
          media={
            <Buildings
              size={22}
              weight="regular"
              className="text-ink-secondary"
            />
          }
        />
      </List>
    </>
  );
}
