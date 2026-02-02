import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import path from "node:path";
import { randomBytes } from "node:crypto";


type Thumbnail = {
  data: ArrayBuffer;
  mediaType: string;
};

const videoThumbnails: Map<string, Thumbnail> = new Map();

export async function handlerGetThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }

  const thumbnail = videoThumbnails.get(videoId);
  if (!thumbnail) {
    throw new NotFoundError("Thumbnail not found");
  }

  return new Response(thumbnail.data, {
    headers: {
      "Content-Type": thumbnail.mediaType,
      "Cache-Control": "no-store",
    },
  });
}

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  //Verify and authenticate
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  //Handle upload process
  const file = await req.formData();
  const fileData = file.get("thumbnail");

  //Check file is a valid file type and image type
  if (!(fileData instanceof File)) {
    throw new BadRequestError("Invalid file type");
  }
  const fileType = fileData.type;
  const allowedTypes = ["image/png", "image/jpeg"];
  if (!allowedTypes.includes(fileType)) {
    throw new BadRequestError("Invalid file type. Only .png or .jpeg accepted");
  }

  //Check file size and error if file too large
  const MAX_UPLOAD_SIZE = 10 << 20;
  if (fileData.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError("File too large and must not exceed 10MB in size");
  }

  // Get video metadata from database and check owner
  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new BadRequestError("Video not found");
  }
  if (video?.userID != userID) {
    throw new UserForbiddenError("Unauthorised user");
  }

  //Read file contents into an array buffer and converts to a buffer
  let thumbnailData = new ArrayBuffer(fileData.size);
  thumbnailData = await fileData.arrayBuffer();
  const fileExt = fileType.split("/")[1];
  const rndBytes = randomBytes(32);
  const thumbnailString = rndBytes.toString('base64');
  const thumbnailName = `${thumbnailString}.${fileExt}`;
  const writePath = path.join(cfg.assetsRoot,thumbnailName);

  //Create the file in assets
  await Bun.write(writePath,thumbnailData);
  const thumbnailURL = new URL(writePath, "http://localhost:8091/").toString();


  //Update video URL and write back to database
  video.thumbnailURL = thumbnailURL;
  updateVideo(cfg.db,video)

  return respondWithJSON(200, video);
}
