import { useGetWorkersQuery } from "../../app/services/workers/workersService"

export default function Workers() {
    const { data: workers } = useGetWorkersQuery();
    return (
        <div>

        </div>
    )
}