class TraceClusterSerializer:

    def serialize(self, clusters):
        def serialize_cluster(cluster):
            segment_indexes = []

            for segment in cluster.get("segments", []) or []:
                segment_index = segment.get("segmentIndex")

                if isinstance(segment_index, int):
                    segment_indexes.append(segment_index)

            children = [
                serialize_cluster(child)
                for child in cluster.get("children", []) or []
                if isinstance(child, dict)
            ]

            return {
                "name": cluster.get("name"),
                "description": cluster.get("description"),
                "segmentIndexes": sorted(set(segment_indexes)),
                "children": children,
            }

        return [
            serialize_cluster(cluster)
            for cluster in clusters or []
            if isinstance(cluster, dict)
        ]