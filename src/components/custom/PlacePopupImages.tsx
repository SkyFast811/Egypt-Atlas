import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Image as ImageIcon, Loader2 } from "lucide-react";
import { findPlaceImages, type PlaceMediaImage } from "#/lib/place-media";

type PlacePopupImagesProps = {
	name: string;
	alternateNames: string[];
	images: PlaceMediaImage[];
	active: boolean;
};

function PlacePopupImages({
	name,
	alternateNames,
	images,
	active,
}: PlacePopupImagesProps) {
	const imageQuery = useQuery({
		queryKey: ["place-popup-images", name, alternateNames],
		queryFn: () => findPlaceImages(name, 12, alternateNames),
		enabled: active && images.length < 2,
		staleTime: 24 * 60 * 60 * 1000,
		gcTime: 7 * 24 * 60 * 60 * 1000,
	});

	const seenImageUrls = new Set<string>();
	const availableImages = [...images, ...(imageQuery.data ?? [])]
		.filter((image) => {
			const key = image.source ?? image.url;
			if (seenImageUrls.has(key)) return false;
			seenImageUrls.add(key);
			return true;
		})
		.slice(0, 12);
	if (!active) return null;

	if (imageQuery.isPending && availableImages.length === 0) {
		return (
			<div className="text-muted-foreground flex items-center gap-2 text-xs">
				<Loader2 className="size-3.5 animate-spin" />
				Looking for verified photos…
			</div>
		);
	}

	if (availableImages.length === 0) {
		return (
			<p className="text-muted-foreground flex items-center gap-2 text-xs">
				<ImageIcon className="size-3.5 shrink-0" />
				{imageQuery.error
					? "Photos could not be loaded."
					: "No verified photos found yet."}
			</p>
		);
	}

	return (
		<div className="grid max-h-72 grid-cols-2 gap-1 overflow-y-auto">
			{availableImages.map((image) => (
				<figure key={image.url} className="min-w-0">
					<img
						className="h-20 w-full rounded-sm object-cover"
						src={image.url}
						alt={image.alt || name}
						loading="lazy"
					/>
					<figcaption className="flex items-center justify-between gap-1 pt-1 text-[10px] text-muted-foreground">
						<span className="truncate">{image.credit || image.alt}</span>
						{image.source && (
							<a
								href={image.source}
								target="_blank"
								rel="noreferrer"
								aria-label={`Image source for ${image.alt}`}
								className="inline-flex shrink-0 items-center gap-1 hover:text-foreground"
								onClick={(event) => event.stopPropagation()}
							>
								Source <ExternalLink className="size-3" />
							</a>
						)}
					</figcaption>
				</figure>
			))}
		</div>
	);
}

export default PlacePopupImages;
