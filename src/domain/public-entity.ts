import type { Entity, PublicEntity } from './types';
/** Navigation needs verified names, never financial or pupil attributes. This also protects Council projections. */
export function publicEntity(entity: Entity): PublicEntity {
  const { synthetic: _, ...metadata } = entity;
  void _;
  return metadata;
}
