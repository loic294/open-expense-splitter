import { useEffect, useState } from "react";
import { useApiCall } from "../api";
import type { CategoryTagEmojiMap } from "../types";

export default function CategoryTagEmojiCard({
  groupId,
  categories,
  tags,
}: {
  groupId: string;
  categories: string[];
  tags: string[];
}) {
  const apiCall = useApiCall();
  const [emojiMap, setEmojiMap] = useState<CategoryTagEmojiMap>({
    category: {},
    tag: {},
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchEmojis = async () => {
      try {
        setLoading(true);
        const map = await apiCall(`/api/batches/${groupId}/emojis`);
        setEmojiMap(map as CategoryTagEmojiMap);
      } catch (error) {
        console.error("Failed to fetch emojis", error);
      } finally {
        setLoading(false);
      }
    };

    fetchEmojis();
  }, [groupId, apiCall]);

  const saveEmoji = async (
    type: "category" | "tag",
    name: string,
    emoji: string,
  ) => {
    if (!emoji.trim()) {
      // Delete emoji if empty
      try {
        setSaving(true);
        await apiCall(
          `/api/batches/${groupId}/emojis/${type}/${encodeURIComponent(name)}`,
          {
            method: "DELETE",
          },
        );
        setEmojiMap((prev) => ({
          ...prev,
          [type]: { ...prev[type], [name]: "" },
        }));
      } catch (error) {
        console.error("Failed to delete emoji", error);
      } finally {
        setSaving(false);
      }
    } else {
      try {
        setSaving(true);
        await apiCall(`/api/batches/${groupId}/emojis`, {
          method: "POST",
          body: JSON.stringify({ type, name, emoji }),
        });
        setEmojiMap((prev) => ({
          ...prev,
          [type]: { ...prev[type], [name]: emoji },
        }));
      } catch (error) {
        console.error("Failed to save emoji", error);
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <div className="card card-border bg-base-100">
      <div className="card-body p-4 gap-3">
        <h4 className="font-semibold">Category & Tag Emojis</h4>
        <p className="text-xs text-base-content/70">
          Assign emojis to categories and tags for quick visual identification.
        </p>

        {loading ? (
          <div className="flex justify-center py-6">
            <span className="loading loading-spinner loading-sm"></span>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Categories */}
            <div>
              <h5 className="font-medium text-sm mb-3">Categories</h5>
              {categories.length > 0 ? (
                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                  {categories.map((category) => (
                    <div
                      key={`cat-${category}`}
                      className="flex items-center gap-2"
                    >
                      <input
                        type="text"
                        maxLength={2}
                        className="input input-sm w-12 text-center"
                        placeholder="🏷️"
                        value={emojiMap.category[category] || ""}
                        onChange={(e) =>
                          saveEmoji("category", category, e.target.value)
                        }
                        disabled={saving}
                      />
                      <span className="text-sm truncate flex-1">
                        {category}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-base-content/50">
                  No categories yet
                </p>
              )}
            </div>

            {/* Tags */}
            <div>
              <h5 className="font-medium text-sm mb-3">Tags</h5>
              {tags.length > 0 ? (
                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                  {tags.map((tag) => (
                    <div key={`tag-${tag}`} className="flex items-center gap-2">
                      <input
                        type="text"
                        maxLength={2}
                        className="input input-sm w-12 text-center"
                        placeholder="🏷️"
                        value={emojiMap.tag[tag] || ""}
                        onChange={(e) => saveEmoji("tag", tag, e.target.value)}
                        disabled={saving}
                      />
                      <span className="text-sm truncate flex-1">{tag}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-base-content/50">No tags yet</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
