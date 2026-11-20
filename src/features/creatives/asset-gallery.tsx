import Link from "next/link";
import { Suspense } from "react";
import { CardImage } from "@/components/patterns/card-image";
import { DataRegion } from "@/components/patterns/data-region";
import { LoadingState } from "@/components/patterns/data-states";
import { SelectFilter } from "@/components/patterns/select-filter";
import { ReportPage } from "@/components/shell/report-page";
import { Card, CardContent, cardGridStyles } from "@/components/ui/card";
import { adPlatformKey, adPlatformLabel } from "@/lib/ad-platforms";
import { REPORT_FILTER_FORM_ID, SHARED_FILTERS, single, withParams, type SearchParams } from "@/lib/filters";
import {
  ASSET_PARAMS,
  ASSET_RELATION,
  assetHref,
  assetLabel,
  assetRoles,
  reportHref,
  type CreativeAsset,
} from "./assets";
import { AssetVideo } from "@/components/patterns/asset-video";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getCreativeAssets } from "./queries";

const linkStyle = "w-fit text-sm font-medium underline underline-offset-4";
function AssetCard({ asset }: { asset: CreativeAsset }) {
  const image = asset.asset_image_url;
  const video = asset.asset_video_url;
  const mediaRole = ["image", "logo", "video"].includes(asset.asset_role);
  const description = asset.asset_text || assetLabel(asset.asset_role);
  const preview = mediaRole && image && (
    <CardImage
      src={image}
      alt={description}
      className="aspect-video object-contain"
      fallback={<span className="p-4 text-sm text-muted-foreground">Preview unavailable</span>}
    />
  );
  return (
    <Card className="min-w-0 gap-0 overflow-hidden py-0">
      {video ? (
        <AssetVideo
          src={video}
          poster={image}
          label={description}
          className="aspect-video w-full bg-muted object-contain"
          fallback={
            <>
              {preview}
              <p className="px-4 pt-2 text-xs text-muted-foreground">Inline playback unavailable. Try Open video.</p>
            </>
          }
        />
      ) : (
        preview
      )}
      <CardContent className="space-y-2 p-4 wrap-anywhere">
        <h2 className="font-semibold">{assetLabel(asset.asset_role)}</h2>
        {asset.asset_text && <p>{asset.asset_text}</p>}
        <p className="text-sm text-muted-foreground">
          {adPlatformLabel(asset.source_system)}
          {asset.ad_creative_id && ` · Creative ${asset.ad_creative_id}`}
        </p>
        {asset.asset_pinned_position && <p className="text-sm">Pinned position: {asset.asset_pinned_position}</p>}
        {asset.asset_performance_label && <p className="text-sm">Platform rating: {asset.asset_performance_label}</p>}
        {asset.asset_status && <p className="text-sm">Platform status: {asset.asset_status}</p>}
        {asset.ad_id && <p className="text-xs text-muted-foreground">Ad {asset.ad_id}</p>}
        {asset.ad_campaign_id && !asset.ad_id && (
          <p className="text-xs text-muted-foreground">Campaign {asset.ad_campaign_id}</p>
        )}
        {asset.asset_video_id && <p className="text-sm">Video ID {asset.asset_video_id}</p>}
        {!asset.asset_video_id && asset.asset_id && <p className="text-sm">Asset ID {asset.asset_id}</p>}
        {asset.asset_role === "video" && !video && (
          <p className="text-xs text-muted-foreground">Playback URL unavailable</p>
        )}
        <div className="flex flex-wrap gap-3">
          {video && (
            <a className={linkStyle} href={video} target="_blank" rel="noreferrer">
              Open video
            </a>
          )}
          {mediaRole && image && (
            <a className={linkStyle} href={image} target="_blank" rel="noreferrer">
              Open image
            </a>
          )}
          {asset.asset_link_url && (
            <a className={linkStyle} href={asset.asset_link_url} target="_blank" rel="noreferrer">
              Open destination
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function AssetGallery({ params }: { params: SearchParams }) {
  const entity = single(params, "entity") ?? "";
  const channel = adPlatformKey(single(params, "channel") ?? "");
  const role = single(params, "role") ?? "";
  const cursor = single(params, "cursor") ?? "";
  return (
    <ReportPage
      title="Creative assets"
      description="Current images, videos, copy and destinations published by the ad platforms."
      pathname="/creatives"
      dates={false}
      params={params}
      agentFilters={{ channel, role }}
      agentOmissions={entity ? ["Selected creative identity"] : []}
      sources={[
        {
          relation: ASSET_RELATION,
          scope: "Current asset inventory for the selected store, independent of delivery dates and spend.",
        },
      ]}
    >
      {({ filters: { storeId }, params: applied, today, timeZone }) => {
        const scope = { storeId, entity, channel, role, cursor };
        // Creative performance's own choices, which Find assets submits unchanged; the filter bar carries the rest.
        const carried = Object.keys(applied).flatMap((name) => {
          const value = single(applied, name);
          const own = ASSET_PARAMS.includes(name) || (SHARED_FILTERS as readonly string[]).includes(name);
          return value === undefined || own ? [] : [{ name, value }];
        });
        return (
          <>
            <nav className="flex flex-wrap items-center gap-4" aria-label="Creative reports">
              <Link prefetch={false} className={linkStyle} href={reportHref(applied)}>
                Creative performance
              </Link>
              {(entity || channel || role || cursor) && (
                <Link prefetch={false} className={linkStyle} href={assetHref(applied)}>
                  All creative assets
                </Link>
              )}
            </nav>
            <input type="hidden" form={REPORT_FILTER_FORM_ID} name="view" value="assets" />
            {carried.map(({ name, value }) => (
              <input key={name} type="hidden" form={REPORT_FILTER_FORM_ID} name={name} value={value} />
            ))}

            {channel && <input type="hidden" form={REPORT_FILTER_FORM_ID} name="channel" value={channel} />}
            <div className="flex flex-wrap items-end gap-4">
              <SelectFilter
                name="role"
                label="Asset type"
                value={role}
                options={[
                  { value: "", label: "All types" },
                  ...Object.entries(assetRoles).map(([value, label]) => ({ value, label })),
                ]}
              />
              <label htmlFor="asset-creative-id" className="grid gap-1 text-sm font-medium">
                Creative ID
                <Input
                  key={entity}
                  id="asset-creative-id"
                  form={REPORT_FILTER_FORM_ID}
                  name="entity"
                  defaultValue={entity}
                  placeholder="All creatives"
                />
              </label>
              <Button type="submit" variant="outline" form={REPORT_FILTER_FORM_ID}>
                Find assets
              </Button>
              {channel && <p className="text-sm text-muted-foreground">{adPlatformLabel(channel)}</p>}
            </div>
            <Suspense
              key={JSON.stringify(scope)}
              fallback={<LoadingState variant="grid" label="Loading creative assets" />}
            >
              <DataRegion
                timestamp={timeZone}
                load={() => getCreativeAssets(scope, today)}
                isEmpty={(data) => !data.rows.length}
                emptyMessage="No published assets match this selection."
              >
                {({ rows, truncated }) => (
                  <>
                    <ul aria-label="Creative assets" className={cardGridStyles}>
                      {rows.map((asset) => (
                        <li key={asset.sm_ad_creative_asset_key} className="min-w-0">
                          <AssetCard asset={asset} />
                        </li>
                      ))}
                    </ul>
                    {truncated && (
                      <Link
                        prefetch={false}
                        className={linkStyle}
                        href={withParams("/creatives", params, {
                          store: storeId,
                          cursor: rows.at(-1)?.sm_ad_creative_asset_key ?? null,
                        })}
                      >
                        Next assets
                      </Link>
                    )}
                  </>
                )}
              </DataRegion>
            </Suspense>
          </>
        );
      }}
    </ReportPage>
  );
}
